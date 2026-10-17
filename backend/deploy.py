"""Migrate once per cold start; seed only an empty demo database, never reset it."""
from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import ROOT, lock_writes
from .models import User
from .seed import seed


def initialize_database(engine, demo=True):
    with engine.begin() as connection:
        lock_writes(connection)
        config = Config(str(ROOT / 'alembic.ini'))
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
        if demo:
            with Session(bind=connection) as db:
                if db.scalar(select(User.id).limit(1)) is None:
                    seed(db)
                    db.flush()
