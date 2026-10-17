import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{ROOT / "data/fairdrop.sqlite3"}')

class Base(DeclarativeBase):
    pass

def make_engine(url):
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 20})
    @event.listens_for(engine, 'connect')
    def configure(conn, _):
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=20000')
    return engine

engine = make_engine(DATABASE_URL)

def get_db(request):
    with Session(request.app.state.engine, expire_on_commit=False) as db:
        try:
            # SQLite serializes writers BEFORE any reads used to validate a mutation.
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                db.connection().exec_driver_sql('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
