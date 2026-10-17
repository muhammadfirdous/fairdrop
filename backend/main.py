import csv
import io
import os
import re
import secrets
import time
from pathlib import Path
from fastapi import FastAPI, Depends, Request, Response, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from .db import engine, ROOT
from .models import User, LoginSession, Plot, Day, WaterRequest, Plan, Turn, Adjustment, now
from .auth import account, coordinator, get_db, digest, passwords, DUMMY, COOKIE, SECURE, user_dict
from .schemas import Login, Source, RequestInput, Review, Preview, Publish, Critical, Delivery, Reason, AdjustmentInput, Target, PlotEdit, Reset, valid_date
from .service import fail, get_day, check_revision, bump, audit, preview, current_plan, accounting, operation, day_payload
from .engine import litres
from .seed import today, reset

DEMO_MODE = os.getenv('DEMO_MODE', 'true').lower() == 'true'


def create_app(db_engine=None):
    app = FastAPI(title='FairDrop', version='1.0.0')
    app.state.engine = db_engine or engine

    @app.middleware('http')
    async def security_headers(request: Request, call_next):
        # Same-origin checks also protect login from login-CSRF; API clients may omit Origin.
        origin = request.headers.get('origin')
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin:
            from urllib.parse import urlparse
            parsed = urlparse(origin)
            expected = request.headers.get('host', '')
            allowed = {f'http://{expected}', f'https://{expected}'}
            if not SECURE:
                allowed.update({'http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:8000', 'http://localhost:8000'})
            if origin not in allowed or not parsed.netloc:
                from fastapi.responses import JSONResponse
                return JSONResponse({'detail': 'Untrusted request origin.'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        if request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/health')
    def health():
        return {'ok': True}

    @app.get('/api/config')
    def config():
        return {'demo': DEMO_MODE, 'community': 'Ak-Bulak Community Garden' if DEMO_MODE else os.getenv('COMMUNITY_NAME', 'Community Garden'), 'today': today(), 'timezone': 'Asia/Bishkek'}

    @app.post('/api/login')
    def login(body: Login, request: Request, response: Response, db=Depends(get_db)):
        user = db.scalar(select(User).where(User.email == body.email.lower()))
        if not passwords.verify(body.password, user.password_hash if user else DUMMY) or not user:
            fail('Email or password is incorrect.', 401)
        old = request.cookies.get(COOKIE)
        if old and (s := db.get(LoginSession, digest(old))):
            db.delete(s)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        db.add(LoginSession(token_hash=digest(token), user_id=user.id, csrf=csrf, expires_at=int(time.time()) + 43200))
        response.set_cookie(COOKIE, token, max_age=43200, httponly=True, secure=SECURE, samesite='lax', path='/')
        return {'user': user_dict(user), 'csrf': csrf}

    @app.get('/api/me')
    def me(request: Request, user=Depends(account)):
        return {'user': user_dict(user), 'csrf': request.state.login_session.csrf}

    @app.post('/api/logout')
    def logout(request: Request, response: Response, user=Depends(account), db=Depends(get_db)):
        db.delete(request.state.login_session)
        response.delete_cookie(COOKIE, path='/', secure=SECURE, httponly=True, samesite='lax')
        return {'ok': True}

    @app.get('/api/bootstrap')
    def bootstrap(user=Depends(account), db=Depends(get_db)):
        return {'plots': [{k: getattr(p, k) for k in ('id', 'name', 'grower_id', 'crop', 'area', 'position', 'active')} for p in db.scalars(select(Plot).order_by(Plot.position, Plot.id))],
                'growers': [user_dict(u) for u in db.scalars(select(User).where(User.role == 'grower').order_by(User.id))] if user.role == 'coordinator' else [],
                'days': [{'date': d.date, 'state': d.state} for d in db.scalars(select(Day).order_by(Day.date.desc()))]}

    @app.put('/api/plots/{plot_id}')
    def update_plot(plot_id: str, body: PlotEdit, user=Depends(coordinator), db=Depends(get_db)):
        day = get_day(db, body.date)
        check_revision(day, body.revision, planning=True)
        if db.scalar(select(Day).where(Day.state.in_(['Ready', 'Active']))):
            fail('Finish or reopen ready days before changing plot assignments. Active days must finish first.')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,12}', plot_id):
            fail('Use a short stable plot identifier (letters, numbers, hyphen or underscore).', 422)
        grower = db.get(User, body.grower_id)
        if not grower or grower.role != 'grower':
            fail('Assign an existing grower account.', 422)
        plot = db.get(Plot, plot_id)
        active = db.scalars(select(Plot).where(Plot.active == True, Plot.id != plot_id)).all()
        if body.active and len(active) >= 6:
            fail('At most six plots may be active.', 422)
        if body.active and any(p.position == body.position for p in active):
            fail('This schematic position is occupied by another active plot.', 422)
        if not body.active and db.scalar(select(WaterRequest).join(Day).where(WaterRequest.plot_id == plot_id, Day.state != 'Closed')):
            fail('A plot with open-day requests cannot be archived. Close those days first.')
        before = {k: getattr(plot, k) for k in body.model_dump() if k not in ('revision', 'date')} if plot else None
        if not plot:
            plot = Plot(id=plot_id)
            db.add(plot)
        for k, v in body.model_dump(exclude={'revision', 'date'}).items():
            setattr(plot, k, v)
        for d in db.scalars(select(Day).where(Day.state == 'Planning')):
            bump(d)
            audit(db, d, user, 'Updated plot', f'{plot.name}: plot record and assignment updated.', {'plot_id': plot_id, 'before': before, 'after': body.model_dump()})
        return {'ok': True}

    @app.post('/api/days/{date}')
    def new_day(date: str, user=Depends(coordinator), db=Depends(get_db)):
        valid_date(date)
        if db.get(Day, date):
            fail('This watering day already exists.')
        d = Day(date=date, opening_ml=160000, flow_ml_min=2000, start=57600, end=64800, changeover=120)
        db.add(d)
        db.flush()
        audit(db, d, user, 'Opened day', 'Planning opened with a 160 L source budget; no requests yet.')
        return {'ok': True}

    @app.get('/api/days/{date}')
    def read_day(date: str, user=Depends(account), db=Depends(get_db)):
        return day_payload(db, get_day(db, date), user)

    @app.put('/api/days/{date}/source')
    def source(date: str, body: Source, user=Depends(coordinator), db=Depends(get_db)):
        day = get_day(db, date)
        check_revision(day, body.revision, True)
        before = {k: getattr(day, k) for k in body.model_dump(exclude={'revision'})}
        for key, value in body.model_dump(exclude={'revision'}).items():
            setattr(day, key, value)
        bump(day)
        audit(db, day, user, 'Changed source / policy', f'Budget {litres(day.opening_ml)} L; flow {litres(day.flow_ml_min)} L/min; policy {day.policy}.', {'before': before, 'after': body.model_dump()})
        return {'ok': True}

    @app.put('/api/days/{date}/requests/{plot_id}')
    def save_request(date: str, plot_id: str, body: RequestInput, user=Depends(account), db=Depends(get_db)):
        day, plot = get_day(db, date), db.get(Plot, plot_id)
        if not plot or (user.role != 'coordinator' and plot.grower_id != user.id):
            fail('You can only change requests for your assigned plot.', 403)
        if not plot.active:
            fail('This plot is archived.', 422)
        check_revision(day, body.revision, True)
        r = db.scalar(select(WaterRequest).where(WaterRequest.date == date, WaterRequest.plot_id == plot_id))
        before = {k: getattr(r, k) for k in ('requested_ml', 'approved_ml', 'minimum_ml', 'start', 'end', 'status', 'note')} if r else None
        if not r:
            r = WaterRequest(date=date, plot_id=plot_id)
            db.add(r)
        for key, value in body.model_dump(exclude={'revision'}).items():
            setattr(r, key, value)
        r.status, r.approved_ml, r.minimum_ml = 'pending', 0, 0
        r.reviewer_id, r.reviewed_at, r.reason, r.updated_at = None, None, '', now()
        bump(day)
        audit(db, day, user, 'Saved request', f'{plot.name}: requested {litres(r.requested_ml)} L; pending review.', {'plot_id': plot_id, 'before': before, 'after': body.model_dump()})
        return {'ok': True}

    @app.post('/api/days/{date}/requests/{plot_id}/review')
    def review_request(date: str, plot_id: str, body: Review, user=Depends(coordinator), db=Depends(get_db)):
        day = get_day(db, date)
        check_revision(day, body.revision, True)
        r = db.scalar(select(WaterRequest).where(WaterRequest.date == date, WaterRequest.plot_id == plot_id))
        if not r:
            fail('Request not found.', 404)
        if not 0 <= body.minimum_ml <= body.approved_ml <= r.requested_ml:
            fail('Use 0 ≤ minimum ≤ approved quantity ≤ requested quantity.', 422)
        if body.status == 'rejected' and (body.approved_ml or body.minimum_ml):
            fail('Rejected requests must have zero approved and minimum quantities.', 422)
        if (body.status == 'rejected' or body.approved_ml != r.requested_ml) and not body.reason:
            fail('Explain the rejection or quantity adjustment.', 422)
        before = {k: getattr(r, k) for k in ('status', 'approved_ml', 'minimum_ml', 'reason')}
        for key, value in body.model_dump(exclude={'revision'}).items():
            setattr(r, key, value)
        r.reviewer_id, r.reviewed_at = user.id, now()
        bump(day)
        audit(db, day, user, 'Approved request' if r.status == 'approved' else 'Rejected request', f'Plot {plot_id}: {litres(r.approved_ml)} L approved; {litres(r.minimum_ml)} L minimum. {r.reason}', {'before': before, 'after': body.model_dump()})
        return {'ok': True}

    @app.post('/api/days/{date}/preview')
    def preview_plan(date: str, body: Preview, user=Depends(coordinator), db=Depends(get_db)):
        day = get_day(db, date)
        check_revision(day, body.revision)
        if body.preset == 'custom' and body.source is None:
            fail('Custom scenarios need source settings.', 422)
        return preview(db, day, body.preset, body.source.model_dump() if body.source else None)

    @app.post('/api/days/{date}/drafts')
    def draft(date: str, body: Critical, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision, True)
            result = preview(db, day)
            p = Plan(date=date, revision=day.revision, status='draft', snapshot=result, creator_id=user.id)
            db.add(p)
            db.flush()
            audit(db, day, user, 'Generated draft', f'Draft {p.id}: {"feasible" if result["feasible"] else "infeasible"}.')
            return {'ok': True, 'draft_id': p.id}
        return operation(db, user, f'{date}/drafts', body, act)

    @app.post('/api/days/{date}/publish')
    def publish(date: str, body: Publish, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision, True)
            p = db.get(Plan, body.draft_id)
            if not p or p.date != date or p.status != 'draft' or p.revision != day.revision:
                fail('This draft is outdated. Generate a new draft from the current revision.')
            result = preview(db, day)
            if not result['feasible'] or p.snapshot != result:
                fail('This plan is infeasible or its inputs changed. Review allocation and generate a new draft.')
            if not result['rows']:
                fail('Approve at least one request before publishing.', 422)
            p.status, p.published_at, day.state = 'published', now(), 'Ready'
            for i, t in enumerate(result['schedule']):
                db.add(Turn(plan_id=p.id, date=date, sequence=i, target_ml=t['allocated_ml'], **t))
            bump(day)
            audit(db, day, user, 'Published plan', f'Plan {p.id} published from input revision {p.revision}.', {'plan_id': p.id})
            return {'ok': True, 'plan_id': p.id}
        return operation(db, user, f'{date}/publish', body, act)

    @app.post('/api/days/{date}/reopen')
    def reopen(date: str, body: Critical, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision)
            if day.state != 'Ready':
                fail('Only a ready plan can be reopened before watering starts.')
            p = current_plan(db, day)
            p.status = 'superseded'
            for t in db.scalars(select(Turn).where(Turn.plan_id == p.id)):
                if t.state != 'Planned':
                    fail('Execution records exist; this plan cannot be reopened.')
                db.delete(t)
            day.state = 'Planning'
            bump(day)
            audit(db, day, user, 'Reopened plan', f'Plan {p.id} preserved as a superseded snapshot.')
            return {'ok': True}
        return operation(db, user, f'{date}/reopen', body, act)

    def execution(db, date, turn_id, user, revision):
        day = get_day(db, date)
        t = db.get(Turn, turn_id)
        if not t or t.date != date:
            fail('Turn not found.', 404)
        if user.role != 'coordinator' and t.grower_id != user.id:
            fail('You can only operate your own watering turn.', 403)
        check_revision(day, revision)
        if day.state not in ('Ready', 'Active'):
            fail('This day is not open for watering.')
        return day, t

    @app.post('/api/days/{date}/turns/{turn_id}/start')
    def start(date: str, turn_id: int, body: Critical, user=Depends(account), db=Depends(get_db)):
        def act():
            day, t = execution(db, date, turn_id, user, body.revision)
            unresolved = db.scalars(select(Turn).where(Turn.date == date, Turn.state.in_(['Planned', 'In progress'])).order_by(Turn.sequence)).all()
            if db.scalar(select(Turn).where(Turn.state == 'In progress')):
                fail('The shared hose is in use. Complete the active turn before starting another day or plot.')
            if t.state != 'Planned' or not unresolved or unresolved[0].id != t.id or any(x.state == 'In progress' for x in unresolved):
                fail('Only the next unresolved turn can start, and the shared hose must be free.')
            if accounting(db, day)['balance_ml'] < t.target_ml:
                fail('The recorded balance is below this execution target. The coordinator must authorize a smaller target, record a genuine adjustment, or mark the turn missed.')
            t.state, t.actual_start, day.state = 'In progress', now(), 'Active'
            bump(day)
            audit(db, day, user, 'Started turn', f'Plot {t.plot_id}: watering started; planned allocation remains {litres(t.allocated_ml)} L.', {'actual_start': t.actual_start, 'planned_start': t.start})
            return {'ok': True}
        return operation(db, user, f'{date}/turns/{turn_id}/start', body, act)

    @app.post('/api/days/{date}/turns/{turn_id}/complete')
    def complete(date: str, turn_id: int, body: Delivery, user=Depends(account), db=Depends(get_db)):
        def act():
            day, t = execution(db, date, turn_id, user, body.revision)
            if t.state != 'In progress':
                fail('Start this turn before recording its completion.')
            if (body.actual_ml == 0 or body.actual_ml > t.allocated_ml or body.actual_ml > t.target_ml) and not body.reason:
                fail('A zero delivery or overdelivery needs an explicit reason.', 422)
            if body.actual_ml > accounting(db, day)['balance_ml']:
                fail('This delivery exceeds the accounted source balance. Your entered value is unchanged. Reconcile source or delivery records before saving.', 422)
            t.actual_ml, t.reason, t.state, t.actual_finish = body.actual_ml, body.reason, 'Completed', now()
            bump(day)
            audit(db, day, user, 'Completed turn', f'Plot {t.plot_id}: {litres(t.actual_ml)} L delivered against {litres(t.allocated_ml)} L planned. {t.reason}', {'actual_ml': t.actual_ml, 'allocated_ml': t.allocated_ml, 'actual_finish': t.actual_finish})
            return {'ok': True, 'actual_ml': t.actual_ml}
        return operation(db, user, f'{date}/turns/{turn_id}/complete', body, act)

    @app.post('/api/days/{date}/turns/{turn_id}/miss')
    def miss(date: str, turn_id: int, body: Reason, user=Depends(account), db=Depends(get_db)):
        def act():
            day, t = execution(db, date, turn_id, user, body.revision)
            if t.state != 'Planned':
                fail('Only an unstarted turn can be marked missed.')
            t.state, t.reason, t.actual_finish, day.state = 'Missed', body.reason, now(), 'Active'
            bump(day)
            audit(db, day, user, 'Marked missed', f'Plot {t.plot_id}: {body.reason}', {'plot_id': t.plot_id})
            return {'ok': True}
        return operation(db, user, f'{date}/turns/{turn_id}/miss', body, act)

    @app.post('/api/days/{date}/turns/{turn_id}/target')
    def target(date: str, turn_id: int, body: Target, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day, t = execution(db, date, turn_id, user, body.revision)
            if t.state != 'Planned' or body.target_ml > t.allocated_ml:
                fail('A smaller target can only be authorized for an unstarted turn.', 422)
            previous = t.target_ml
            t.target_ml = body.target_ml
            bump(day)
            audit(db, day, user, 'Authorized execution target', f'Plot {t.plot_id}: execute {litres(t.target_ml)} L; original allocation {litres(t.allocated_ml)} L. {body.reason}', {'before_ml': previous, 'after_ml': t.target_ml, 'reason': body.reason})
            return {'ok': True}
        return operation(db, user, f'{date}/turns/{turn_id}/target', body, act)

    @app.post('/api/days/{date}/turns/{turn_id}/correct')
    def correct(date: str, turn_id: int, body: Delivery, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision)
            t = db.get(Turn, turn_id)
            if not t or t.date != date or t.state != 'Completed':
                fail('Only completed deliveries can be corrected.', 422)
            if not body.reason:
                fail('A correction needs a reason.', 422)
            if body.actual_ml > accounting(db, day)['balance_ml'] + t.actual_ml:
                fail('The corrected delivery exceeds the accounted source balance. Reconcile records first.', 422)
            previous = t.actual_ml
            t.actual_ml, t.reason = body.actual_ml, body.reason
            bump(day)
            audit(db, day, user, 'Corrected delivery', f'Plot {t.plot_id}: {litres(previous)} L → {litres(t.actual_ml)} L. {body.reason}', {'turn_id': t.id, 'previous_ml': previous, 'actual_ml': t.actual_ml, 'reason': body.reason})
            return {'ok': True, 'actual_ml': t.actual_ml}
        return operation(db, user, f'{date}/turns/{turn_id}/correct', body, act)

    @app.post('/api/days/{date}/adjustments')
    def adjust(date: str, body: AdjustmentInput, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision)
            if day.state == 'Planning':
                fail('During planning, edit the opening budget. Record source adjustments after publication.')
            if body.amount_ml == 0 or accounting(db, day)['balance_ml'] + body.amount_ml < 0:
                fail('Enter a non-zero adjustment that keeps the recorded balance non-negative.', 422)
            db.add(Adjustment(date=date, amount_ml=body.amount_ml, reason=body.reason, actor_id=user.id))
            bump(day)
            audit(db, day, user, 'Source adjustment', f'{litres(body.amount_ml)} L: {body.reason}', {'amount_ml': body.amount_ml, 'reason': body.reason})
            return {'ok': True}
        return operation(db, user, f'{date}/adjustments', body, act)

    @app.post('/api/days/{date}/close')
    def close(date: str, body: Critical, user=Depends(coordinator), db=Depends(get_db)):
        def act():
            day = get_day(db, date)
            check_revision(day, body.revision)
            if day.state not in ('Ready', 'Active') or db.scalar(select(Turn).where(Turn.date == date, Turn.state.in_(['Planned', 'In progress']))):
                fail('Complete or mark every turn missed before closing the day.')
            day.state = 'Closed'
            bump(day)
            audit(db, day, user, 'Closed day', 'All watering turns are resolved. The plan and actual ledger remain available.')
            return {'ok': True}
        return operation(db, user, f'{date}/close', body, act)

    @app.get('/api/days/{date}/export.csv')
    def export(date: str, user=Depends(account), db=Depends(get_db)):
        day = get_day(db, date)
        payload = day_payload(db, day, user)
        if user.role != 'coordinator' and not payload['plan']:
            fail('The community ledger is available after publication.', 403)
        buf = io.StringIO()
        writer = csv.writer(buf)
        def safe(value):
            value = str(value if value is not None else '')
            return "'" + value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else value
        writer.writerow(['Date', 'Plot', 'Name', 'Requested L', 'Approved L', 'Allocated L', 'Start seconds', 'End seconds', 'Actual L', 'Turn status', 'Reason'])
        snap = payload['plan']['snapshot'] if payload['plan'] else preview(db, day)
        for r in snap['requests']:
            row = next((x for x in snap['rows'] if x['plot_id'] == r['plot_id']), {})
            turn = next((t for t in payload['turns'] if t['plot_id'] == r['plot_id']), {})
            writer.writerow([safe(x) for x in [date, r['plot_id'], r['name'], litres(r['requested_ml']), litres(r['approved_ml']), litres(row.get('allocated_ml') or 0), turn.get('start', ''), turn.get('end', ''), litres(turn.get('actual_ml', 0)) if turn.get('state') in ('Completed', 'Missed') else '', turn.get('state', 'Unscheduled'), turn.get('reason', r['reason'])]])
        writer.writerow([])
        writer.writerow(['Accounting metric', 'Litres'])
        for k, v in payload['accounting'].items():
            writer.writerow([k.removesuffix('_ml'), litres(v)])
        writer.writerow([])
        writer.writerow(['Timestamp', 'Actor', 'Action', 'Detail'])
        for a in reversed(payload['activity']):
            writer.writerow([safe(a[k]) for k in ('created_at', 'actor', 'action', 'detail')])
        return Response('\ufeff' + buf.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="fairdrop-{date}.csv"'})

    @app.post('/api/demo/reset')
    def demo_reset(body: Reset, user=Depends(coordinator), db=Depends(get_db)):
        if not DEMO_MODE:
            fail('Demo reset is disabled outside demo mode.', 403)
        date = reset(db)
        return {'ok': True, 'date': date}

    @app.api_route('/api/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
    def api_not_found(path: str):
        fail('API endpoint not found.', 404)

    dist = ROOT / 'frontend/dist'
    if dist.exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')
        @app.get('/{path:path}')
        def frontend(path: str):
            candidate = (dist / path).resolve()
            if candidate.is_file() and candidate.is_relative_to(dist.resolve()):
                return FileResponse(candidate)
            return FileResponse(dist / 'index.html')
    return app

app = create_app()
