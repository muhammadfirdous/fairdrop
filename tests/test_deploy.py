from sqlalchemy import select, func
from sqlalchemy.schema import CreateIndex
from sqlalchemy.dialects import postgresql
from backend.db import make_engine
from backend.deploy import initialize_database
from backend.models import Day, User, Turn
from sqlalchemy.orm import Session


def test_cold_start_migrates_seeds_and_preserves_existing_data(tmp_path):
    engine = make_engine(f'sqlite:///{tmp_path}/deploy.sqlite3')
    initialize_database(engine)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 7
        day = db.scalar(select(Day))
        date = day.date
        day.opening_ml = 123000
        db.commit()
    initialize_database(engine)
    with Session(engine) as db:
        assert db.get(Day, date).opening_ml == 123000
        assert db.scalar(select(func.count()).select_from(User)) == 7
    engine.dispose()


def test_postgres_only_active_turns_are_unique():
    index = next(i for i in Turn.__table__.indexes if i.name == 'one_active_hose')
    sql = str(CreateIndex(index).compile(dialect=postgresql.dialect()))
    assert "WHERE state = 'In progress'" in sql


def test_production_initialization_does_not_create_demo_accounts(tmp_path):
    engine = make_engine(f'sqlite:///{tmp_path}/production.sqlite3')
    initialize_database(engine, demo=False)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
    engine.dispose()
