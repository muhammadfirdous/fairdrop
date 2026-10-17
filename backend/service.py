import hashlib
import json
from sqlalchemy import select, func
from fastapi import HTTPException
from .models import Day, Plot, WaterRequest, Plan, Turn, Adjustment, Activity, Operation, User
from .engine import calculate, litres
from .schemas import valid_date


def fail(message, code=409):
    raise HTTPException(code, message)


def get_day(db, date):
    valid_date(date)
    day = db.get(Day, date)
    if not day:
        fail('No watering day exists for this date. Ask the coordinator to open a day.', 404)
    return day


def check_revision(day, revision, planning=False):
    if day.revision != revision:
        fail(f'This day changed (revision {day.revision}). Refresh the day and review your values before trying again.')
    if planning and day.state != 'Planning':
        fail('Planning inputs are locked. Reopen the plan before execution; active and closed days cannot be replanned.')


def bump(day):
    day.revision += 1


def audit(db, day, user, action, detail, data=None):
    db.add(Activity(date=day.date, actor_id=user.id, action=action, detail=detail, data=data or {}))


def source_dict(day):
    return {k: getattr(day, k) for k in ('opening_ml', 'flow_ml_min', 'start', 'end', 'changeover', 'timezone')}


def request_dict(r, plot, grower):
    return {**{k: getattr(r, k) for k in ('id', 'plot_id', 'requested_ml', 'approved_ml', 'minimum_ml', 'start', 'end', 'note', 'status', 'reason', 'submitted_at', 'updated_at', 'reviewer_id', 'reviewed_at')},
            'name': plot.name, 'crop': plot.crop, 'area': plot.area, 'position': plot.position, 'grower_id': plot.grower_id, 'grower_name': grower.name}


def inputs(db, day):
    records = db.execute(select(WaterRequest, Plot, User).join(Plot, WaterRequest.plot_id == Plot.id).join(User, Plot.grower_id == User.id).where(WaterRequest.date == day.date).order_by(Plot.id)).all()
    return [request_dict(r, p, u) for r, p, u in records]


def preview(db, day, preset='saved', custom=None):
    requests, source, policy = inputs(db, day), source_dict(day), day.policy
    if day.state != 'Planning':
        plan = current_plan(db, day)
        if plan:
            requests = json.loads(json.dumps(plan.snapshot['requests']))
            source, policy = dict(plan.snapshot['source']), plan.snapshot['policy']
    if preset == 'adequate':
        source['opening_ml'] = sum(r['approved_ml'] for r in requests if r['status'] == 'approved')
        # Full approved volumes need broader operating and availability windows in this demo.
        # Preserve actual windows so the scenario honestly exposes scheduling conflicts.
    elif preset == 'shortage':
        source['opening_ml'] = 160000
    elif preset in ('changed-b', 'short-f'):
        for r in requests:
            if preset == 'changed-b' and r['plot_id'] == 'B':
                r['start'], r['end'] = 16 * 3600 + 45 * 60, 17 * 3600 + 5 * 60
            if preset == 'short-f' and r['plot_id'] == 'F':
                r['start'], r['end'] = 17 * 3600, 17 * 3600 + 10 * 60
    if custom is not None:
        source.update({k: v for k, v in custom.items() if k not in ('revision', 'policy')})
        policy = custom['policy']
    result = calculate(requests, source, policy)
    return {**result, 'revision': day.revision, 'preset': preset}


def current_plan(db, day):
    return db.scalar(select(Plan).where(Plan.date == day.date, Plan.status == 'published').order_by(Plan.id.desc()))


def accounting(db, day):
    adjustment = db.scalar(select(func.coalesce(func.sum(Adjustment.amount_ml), 0)).where(Adjustment.date == day.date))
    turns = db.scalars(select(Turn).where(Turn.date == day.date).order_by(Turn.sequence)).all()
    delivered = sum(t.actual_ml for t in turns)
    plan = current_plan(db, day)
    opening = plan.snapshot['source']['opening_ml'] if plan else day.opening_ml
    balance = opening + adjustment - delivered
    remaining = sum(t.allocated_ml for t in turns if t.state in ('Planned', 'In progress'))
    return {'opening_ml': opening, 'adjustment_ml': adjustment, 'delivered_ml': delivered, 'balance_ml': balance,
            'remaining_plan_ml': remaining, 'remaining_shortfall_ml': max(remaining - balance, 0),
            'delivery_shortfall_ml': sum(max(t.allocated_ml - t.actual_ml, 0) for t in turns),
            'finalized_shortfall_ml': sum(max(t.allocated_ml - t.actual_ml, 0) for t in turns if t.state in ('Completed', 'Missed'))}


def operation(db, user, route, body, action):
    payload = body.model_dump()
    key = payload.pop('operation_id')
    fingerprint = hashlib.sha256(json.dumps({'route': route, 'data': payload}, sort_keys=True).encode()).hexdigest()
    existing = db.get(Operation, key)
    if existing:
        if existing.actor_id != user.id or existing.fingerprint != fingerprint:
            fail('This operation identifier was already used with different data. Use a new identifier.')
        return existing.result
    result = action()
    db.add(Operation(key=key, actor_id=user.id, fingerprint=fingerprint, result=result))
    db.flush()
    return result


def day_payload(db, day, user):
    db.flush()
    plans = db.scalars(select(Plan).where(Plan.date == day.date).order_by(Plan.id.desc())).all()
    published = next((p for p in plans if p.status == 'published'), None)
    draft = next((p for p in plans if p.status == 'draft' and p.revision == day.revision), None) if user.role == 'coordinator' else None
    def plan_json(p):
        return {'id': p.id, 'revision': p.revision, 'status': p.status, 'created_at': p.created_at, 'published_at': p.published_at, 'snapshot': p.snapshot} if p else None
    requests = inputs(db, day)
    if user.role != 'coordinator' and not published:
        requests = [r for r in requests if r['grower_id'] == user.id]
    turns = db.scalars(select(Turn).where(Turn.date == day.date).order_by(Turn.sequence)).all()
    activities = db.execute(select(Activity, User.name).join(User, Activity.actor_id == User.id).where(Activity.date == day.date).order_by(Activity.id.desc())).all()
    return {'date': day.date, 'state': day.state, 'revision': day.revision, 'source': source_dict(day), 'policy': day.policy,
            'requests': requests, 'plan': plan_json(published), 'draft': plan_json(draft),
            'history': [plan_json(p) for p in plans if user.role == 'coordinator' or p.status in ('published', 'superseded')],
            'turns': [{k: getattr(t, k) for k in ('id', 'plot_id', 'grower_id', 'sequence', 'allocated_ml', 'target_ml', 'start', 'end', 'state', 'actual_ml', 'actual_start', 'actual_finish', 'reason')} for t in turns],
            'accounting': accounting(db, day),
            'activity': [{'id': a.id, 'actor': name, 'action': a.action, 'detail': a.detail, 'data': a.data, 'created_at': a.created_at} for a, name in activities if user.role == 'coordinator' or a.actor_id == user.id or a.action in ('Published plan', 'Reopened plan', 'Started turn', 'Completed turn', 'Marked missed', 'Source adjustment', 'Corrected delivery', 'Closed day')]}
