import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.db import Base, make_engine
from backend.main import create_app
from backend.seed import seed, DEMO_PASSWORD

DATE = '2026-10-17'
@pytest.fixture
def env(tmp_path):
    url = f'sqlite:///{tmp_path}/test.sqlite3'
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed(db, DATE)
        db.commit()
    app = create_app(engine)
    yield app, engine, url
    engine.dispose()

def login(app, letter=None):
    c = TestClient(app)
    email = f'grower.{letter.lower()}@fairdrop.local' if letter else 'coordinator@fairdrop.local'
    result = c.post('/api/login', json={'email': email, 'password': DEMO_PASSWORD})
    assert result.status_code == 200, result.text
    c.headers['X-CSRF-Token'] = result.json()['csrf']
    return c

@pytest.fixture
def client(env):
    return login(env[0])
