from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import make_engine
from backend.main import create_app
from backend.models import Plot, Day, LoginSession
from backend.seed import seed
from conftest import DATE, login
P=f'/api/days/{DATE}'

def read(c):
    r=c.get(P);assert r.status_code==200,r.text;return r.json()

def op(c,path,**extra):
    return c.post(P+path,json={'revision':read(c)['revision'],'operation_id':str(uuid4()),**extra})

def publish(c):
    result=op(c,'/drafts');assert result.status_code==200,result.text
    result=op(c,'/publish',draft_id=result.json()['draft_id']);assert result.status_code==200,result.text
    return read(c)

def start(c):
    d=publish(c);t=d['turns'][0];r=op(c,f'/turns/{t["id"]}/start');assert r.status_code==200,r.text
    return t

def test_auth_csrf_and_cookie(env,client):
    guest=TestClient(env[0]);assert guest.get(P).status_code==401
    assert guest.post('/api/login',json={'email':'coordinator@fairdrop.local','password':'wrong'}).status_code==401
    result=guest.post('/api/login',json={'email':'coordinator@fairdrop.local','password':'GardenTogether!26'})
    assert 'HttpOnly' in result.headers['set-cookie'] and 'SameSite=lax' in result.headers['set-cookie']
    assert guest.post(P+'/drafts',json={'revision':1,'operation_id':str(uuid4())}).status_code==403
    assert client.post(P+'/drafts',json={'revision':1,'operation_id':str(uuid4())},headers={'Origin':'https://evil.invalid'}).status_code==403
    assert client.post('/api/logout').status_code==200
    assert client.get(P).status_code==401

def test_session_expiry(env,client):
    with Session(env[1]) as db:
        for s in db.scalars(select(LoginSession)):s.expires_at=0
        db.commit()
    assert client.get(P).status_code==401

def test_grower_permissions_and_reapproval(env,client):
    g=login(env[0],'A');d=read(g)
    assert g.put(P+'/requests/B',json={'revision':d['revision'],'requested_ml':10000,'start':57600,'end':59000,'note':''}).status_code==403
    assert g.post(P+'/publish',json={'revision':1,'draft_id':1,'operation_id':str(uuid4())}).status_code==403
    assert g.post(P+'/requests/A/review',json={'revision':1,'status':'approved','approved_ml':1,'minimum_ml':0,'reason':''}).status_code==403
    assert g.put(P+'/source',json={**{k:v for k,v in d['source'].items() if k!='timezone'},'policy':'proportional','revision':1}).status_code==403
    assert g.put(P+'/requests/A',json={'revision':d['revision'],'requested_ml':60000,'start':57600,'end':59400,'note':'Changed note'}).status_code==200
    req=read(client)['requests'][0]
    assert req['status']=='pending' and req['approved_ml']==0 and req['reviewer_id'] is None
    review={'revision':read(client)['revision'],'status':'approved','approved_ml':60000,'minimum_ml':12000,'reason':''}
    assert client.post(P+'/requests/A/review',json=review).status_code==200
    assert read(g)['requests'][0]['status']=='approved'

@pytest.mark.parametrize('patch',[{'requested_ml':-1},{'requested_ml':1.5},{'requested_ml':'NaN'},{'start':60000,'end':50000},{'end':90000},{'approved_ml':3000},{'owner':99}])
def test_request_validation(client,patch):
    assert client.put(P+'/requests/A',json={'revision':1,'requested_ml':60000,'start':57600,'end':59400,'note':'',**patch}).status_code==422

@pytest.mark.parametrize('patch',[{'flow_ml_min':0},{'flow_ml_min':-1},{'opening_ml':-1},{'end':50000},{'changeover':-1},{'policy':'secret'}])
def test_source_validation(client,patch):
    d=read(client);body={k:v for k,v in d['source'].items() if k!='timezone'}
    assert client.put(P+'/source',json={**body,'revision':1,'policy':'proportional',**patch}).status_code==422

def test_dates_and_reduction_reasons(client):
    assert client.post('/api/days/2026-02-30').status_code==422
    assert client.post(P+'/requests/A/review',json={'revision':1,'status':'approved','approved_ml':30000,'minimum_ml':0,'reason':''}).status_code==422
    assert client.post(P+'/requests/A/review',json={'revision':1,'status':'approved','approved_ml':70000,'minimum_ml':0,'reason':'More'}).status_code==422
    assert client.post(P+'/requests/A/review',json={'revision':1,'status':'approved','approved_ml':30000,'minimum_ml':40000,'reason':'Less'}).status_code==422

def test_stale_draft_and_scenario_isolation(client):
    draft=op(client,'/drafts').json()['draft_id'];before=read(client)
    scenario=client.post(P+'/preview',json={'revision':1,'preset':'short-f'}).json()
    assert not scenario['feasible'] and read(client)==before
    source={k:v for k,v in before['source'].items() if k!='timezone'}
    assert client.put(P+'/source',json={**source,'revision':1,'policy':'proportional','opening_ml':150000}).status_code==200
    assert op(client,'/publish',draft_id=draft).status_code==409
    assert client.post(P+'/publish',json={'revision':1,'operation_id':str(uuid4()),'draft_id':draft}).status_code==409

def test_infeasible_draft_cannot_publish(client):
    assert client.put(P+'/requests/F',json={'revision':1,'requested_ml':60000,'start':61200,'end':61800,'note':''}).status_code==200
    assert client.post(P+'/requests/F/review',json={'revision':2,'status':'approved','approved_ml':60000,'minimum_ml':0,'reason':''}).status_code==200
    draft=op(client,'/drafts').json()['draft_id']
    assert not read(client)['draft']['snapshot']['feasible']
    assert op(client,'/publish',draft_id=draft).status_code==409

def test_reopening_preserves_snapshot_and_active_locks(client):
    d=publish(client);snap=d['plan']['snapshot'];old=d['plan']['id']
    assert op(client,'/reopen').status_code==200
    d=read(client);assert d['state']=='Planning' and d['turns']==[]
    assert next(p for p in d['history'] if p['id']==old)['snapshot']==snap
    assert next(p for p in d['history'] if p['id']==old)['status']=='superseded'
    d=publish(client);assert op(client,f'/turns/{d["turns"][0]["id"]}/start').status_code==200
    assert op(client,'/reopen').status_code==409
    assert client.put(P+'/requests/A',json={'revision':read(client)['revision'],'requested_ml':1,'start':57600,'end':59400,'note':''}).status_code==409
    assert client.post(P+'/preview',json={'revision':read(client)['revision'],'preset':'short-f'}).status_code==200

def test_concrete_overdelivery_idempotency_adjustment_and_correction(env,client):
    t=start(client);body={'revision':read(client)['revision'],'operation_id':str(uuid4()),'actual_ml':50000,'reason':'Measured 50 L; hose stopped late.'}
    result=client.post(P+f'/turns/{t["id"]}/complete',json=body);assert result.status_code==200,result.text
    d=read(client);a=d['accounting']
    assert a['delivered_ml']==50000 and a['balance_ml']==110000 and a['remaining_plan_ml']==120000 and a['remaining_shortfall_ml']==10000
    assert a['delivery_shortfall_ml']==120000
    assert client.post(P+f'/turns/{t["id"]}/complete',json=body).json()==result.json()
    assert read(client)['accounting']==a
    assert client.post(P+f'/turns/{t["id"]}/complete',json={**body,'actual_ml':51000}).status_code==409
    snap=d['plan']['snapshot']
    assert op(client,'/adjustments',amount_ml=10000,reason='10 L measured top-up').status_code==200
    assert read(client)['accounting']['balance_ml']==120000 and read(client)['plan']['snapshot']==snap
    assert op(client,f'/turns/{t["id"]}/correct',actual_ml=45000,reason='Corrected graduated jug reading').status_code==200
    d=read(client);assert d['accounting']['balance_ml']==125000
    correction=next(a for a in d['activity'] if a['action']=='Corrected delivery')
    assert correction['data']['previous_ml']==50000 and correction['data']['actual_ml']==45000 and correction['actor'] and correction['created_at']
    engine2=make_engine(env[2]);restarted=login(create_app(engine2));assert read(restarted)['accounting']==d['accounting'];engine2.dispose()

def test_partial_zero_and_missing_reasons(client):
    t=start(client)
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=50000,reason='').status_code==422
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=0,reason='').status_code==422
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=25000,reason='Stopped early').status_code==200
    d=read(client);assert d['accounting']['finalized_shortfall_ml']==15000 and d['accounting']['balance_ml']==135000
    t=d['turns'][1];assert op(client,f'/turns/{t["id"]}/start').status_code==200
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=0,reason='No flow from hose').status_code==200

def test_balance_limit_target_miss_close(client):
    t=start(client)
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=161000,reason='Measured').status_code==422
    assert read(client)['accounting']['delivered_ml']==0
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=159000,reason='Measured overdelivery').status_code==200
    d=read(client);t=d['turns'][1]
    assert op(client,f'/turns/{t["id"]}/start').status_code==409
    assert op(client,f'/turns/{t["id"]}/target',target_ml=1000,reason='Grower agreed to remaining supply').status_code==200
    assert op(client,f'/turns/{t["id"]}/start').status_code==200
    assert op(client,f'/turns/{t["id"]}/complete',actual_ml=1000,reason='').status_code==200
    for t in read(client)['turns'][2:]:assert op(client,f'/turns/{t["id"]}/miss',reason='No remaining water').status_code==200
    assert op(client,'/close').status_code==200 and read(client)['state']=='Closed'

def test_grower_owns_turn(env,client):
    d=publish(client);g=login(env[0],'B');body={'revision':d['revision'],'operation_id':str(uuid4())}
    assert g.post(P+f'/turns/{d["turns"][0]["id"]}/start',json=body).status_code==403
    own=login(env[0],'A');assert own.post(P+f'/turns/{d["turns"][0]["id"]}/start',json=body).status_code==200
    assert op(own,f'/turns/{d["turns"][0]["id"]}/complete',actual_ml=40000,reason='').status_code==200

def test_concurrent_starts(env,client):
    d=publish(client);c2=login(env[0]);rev=d['revision'];tid=d['turns'][0]['id']
    def attempt(c):return c.post(P+f'/turns/{tid}/start',json={'revision':rev,'operation_id':str(uuid4())}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,[client,c2]))
    assert sorted(results)==[200,409]
    assert len([t for t in read(client)['turns'] if t['state']=='In progress'])==1

def test_concurrent_balance_mutations_cannot_overspend(env,client):
    t=start(client);c2=login(env[0]);rev=read(client)['revision']
    def complete():return client.post(P+f'/turns/{t["id"]}/complete',json={'revision':rev,'operation_id':str(uuid4()),'actual_ml':150000,'reason':'Measured 150 L'}).status_code
    def loss():return c2.post(P+'/adjustments',json={'revision':rev,'operation_id':str(uuid4()),'amount_ml':-50000,'reason':'Measured loss'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(complete),pool.submit(loss)];results=[f.result() for f in futures]
    assert sorted(results)==[200,409] and read(client)['accounting']['balance_ml']>=0

def test_seed_idempotent_and_csv_formula_safe(env,client):
    before=read(client)
    with Session(env[1]) as db:
        seed(db,DATE);db.get(Plot,'A').name='=HYPERLINK("evil")';db.commit()
    assert read(client)['revision']==before['revision'] and len(read(client)['requests'])==6
    text=client.get(P+'/export.csv').text
    assert "'=HYPERLINK" in text
    assert client.get('/api/nonexistent').status_code==404

def test_archive_preserves_history_and_max_plots(env,client):
    boot=client.get('/api/bootstrap').json();p=boot['plots'][0]
    body={k:v for k,v in p.items() if k!='id'};body.update(date=DATE,revision=1)
    assert client.put('/api/plots/G',json=body).status_code==422
    assert client.put('/api/plots/A',json={**body,'active':False}).status_code==409

def test_hose_is_shared_across_saved_days(env,client):
    t=start(client)
    other='2026-10-18'
    with Session(env[1]) as db:
        seed(db,other);db.commit()
    p=f'/api/days/{other}'
    draft=client.post(p+'/drafts',json={'revision':1,'operation_id':str(uuid4())}).json()['draft_id']
    assert client.post(p+'/publish',json={'revision':1,'operation_id':str(uuid4()),'draft_id':draft}).status_code==200
    d=client.get(p).json()
    result=client.post(p+f'/turns/{d["turns"][0]["id"]}/start',json={'revision':d['revision'],'operation_id':str(uuid4())})
    assert result.status_code==409 and 'shared hose' in result.json()['detail']
    assert read(client)['turns'][0]['id']==t['id'] and read(client)['turns'][0]['state']=='In progress'

def test_demo_reset_disabled_in_non_demo_mode(monkeypatch,client):
    monkeypatch.setattr('backend.main.DEMO_MODE',False)
    assert client.post('/api/demo/reset',json={'confirmation':'RESET FICTIONAL DEMO'}).status_code==403
    assert read(client)['requests']

def test_server_restart_with_real_process(tmp_path):
    import os, subprocess, sys, socket, time, httpx
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    env={**os.environ,'DATABASE_URL':f'sqlite:///{tmp_path}/restart.sqlite3','DEMO_MODE':'true'}
    subprocess.run([sys.executable,'-m','alembic','upgrade','head'],cwd=root,env=env,check=True,capture_output=True)
    subprocess.run([sys.executable,'-m','backend.cli','seed','--date',DATE],cwd=root,env=env,check=True,capture_output=True)
    def launch():
        process=subprocess.Popen([sys.executable,'-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',str(port)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                if httpx.get(f'http://127.0.0.1:{port}/api/health').status_code==200:return process
            except httpx.HTTPError:pass
            time.sleep(.05)
        process.terminate();process.wait();raise AssertionError('Server did not start')
    process=launch()
    c=httpx.Client(base_url=f'http://127.0.0.1:{port}')
    try:
        auth=c.post('/api/login',json={'email':'coordinator@fairdrop.local','password':'GardenTogether!26'}).json()
        c.headers['X-CSRF-Token']=auth['csrf']
        t=start(c)
        assert op(c,f'/turns/{t["id"]}/complete',actual_ml=25000,reason='Restart persistence test').status_code==200
        before=read(c)
        process.terminate();process.wait(timeout=10)
        process=launch()
        after=read(c)
        assert after==before
    finally:
        process.terminate();process.wait(timeout=10);c.close()

def test_development_supervisor_cleans_children(tmp_path):
    import os, socket, subprocess, time, httpx
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    ports=[]
    for _ in range(2):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));ports.append(sock.getsockname()[1])
    env={**os.environ,'DATABASE_URL':f'sqlite:///{tmp_path}/dev.sqlite3','FAIRDROP_API_PORT':str(ports[0]),'FAIRDROP_WEB_PORT':str(ports[1])}
    process=subprocess.Popen([str(root/'scripts/dev.sh')],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(120):
            try:
                a=httpx.get(f'http://127.0.0.1:{ports[0]}/api/health',timeout=1)
                b=httpx.get(f'http://127.0.0.1:{ports[1]}/api/health',timeout=1)
                if a.status_code==b.status_code==200:break
            except httpx.HTTPError:pass
            time.sleep(.1)
        else:raise AssertionError('Development services or their proxy did not start')
    finally:
        process.terminate();process.wait(timeout=15)
    for port in ports:
        with socket.socket() as sock:
            assert sock.connect_ex(('127.0.0.1',port))!=0, f'Child still listening on {port}'
