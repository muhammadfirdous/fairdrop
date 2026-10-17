import hashlib
import secrets
import time
import os
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from .db import get_db as raw_db
from .models import LoginSession, User

passwords = PasswordHash.recommended()
DUMMY = passwords.hash(secrets.token_urlsafe(24))
COOKIE = 'fairdrop_session'
SECURE = os.getenv('COOKIE_SECURE', 'true' if os.getenv('VERCEL') else 'false').lower() == 'true'

# Request annotation is needed on the dependency exposed to FastAPI.
def get_db(request: Request):
    yield from raw_db(request)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def account(request: Request, db=Depends(get_db)):
    token = request.cookies.get(COOKIE, '')
    session = db.get(LoginSession, digest(token)) if token else None
    if not session or session.expires_at <= int(time.time()):
        raise HTTPException(401, 'Your session has expired. Log in to continue.')
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        csrf = request.headers.get('X-CSRF-Token', '')
        if not secrets.compare_digest(csrf, session.csrf):
            raise HTTPException(403, 'CSRF check failed. Refresh your session before trying again.')
    request.state.login_session = session
    return db.get(User, session.user_id)

def coordinator(user=Depends(account)):
    if user.role != 'coordinator':
        raise HTTPException(403, 'Only the coordinator can perform this action.')
    return user

def user_dict(user):
    return {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role}
