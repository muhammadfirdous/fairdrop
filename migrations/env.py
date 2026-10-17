from alembic import context
from backend.db import engine, Base
from backend import models

def run(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=connection.dialect.name == 'sqlite')
    with context.begin_transaction():
        context.run_migrations()

connection = context.config.attributes.get('connection')
if connection is not None:
    run(connection)
else:
    with engine.connect() as connection:
        run(connection)
