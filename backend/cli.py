import argparse
import getpass
import os
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import engine
from .models import User
from .auth import passwords
from .seed import seed, reset
from .schemas import valid_date
parser = argparse.ArgumentParser(description='FairDrop local administration')
sub = parser.add_subparsers(dest='command', required=True)
s = sub.add_parser('seed')
s.add_argument('--date', default=None)
r = sub.add_parser('reset-demo')
r.add_argument('--confirm', required=True)
r.add_argument('--date', default=None)
c = sub.add_parser('create-user')
c.add_argument('--email', required=True)
c.add_argument('--name', required=True)
c.add_argument('--role', choices=['coordinator', 'grower'], default='coordinator')
args = parser.parse_args()
with Session(engine) as db:
    if args.command in ('seed', 'reset-demo'):
        if os.getenv('DEMO_MODE', 'true').lower() != 'true':
            parser.error('Demo seeding/reset is disabled. Set DEMO_MODE=true only for a fictional demo database.')
        if args.date:
            valid_date(args.date)
        if args.command == 'reset-demo' and args.confirm != 'RESET FICTIONAL DEMO':
            parser.error('Reset deletes ALL users, sessions, plots, saved days, plans, deliveries and history in this demo database. Pass --confirm "RESET FICTIONAL DEMO".')
        print('Demo day:', reset(db, args.date) if args.command == 'reset-demo' else seed(db, args.date))
    else:
        if db.scalar(select(User).where(User.email == args.email.lower())):
            parser.error('This email already exists.')
        password = getpass.getpass('New password (12+ characters): ')
        if len(password) < 12 or password != getpass.getpass('Repeat password: '):
            parser.error('Passwords must match and contain at least 12 characters.')
        db.add(User(email=args.email.lower(), name=args.name, role=args.role, password_hash=passwords.hash(password)))
        print('Created', args.role, args.email.lower())
    db.commit()
