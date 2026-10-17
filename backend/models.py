from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, JSON, UniqueConstraint, CheckConstraint, Index, text
from .db import Base

def now():
    return datetime.now(timezone.utc).isoformat()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    __table_args__ = (CheckConstraint("role IN ('coordinator','grower')"),)

class LoginSession(Base):
    __tablename__ = 'sessions'
    token_hash = Column(String, primary_key=True)
    user_id = Column(ForeignKey('users.id'), nullable=False)
    csrf = Column(String, nullable=False)
    expires_at = Column(Integer, nullable=False)

class Plot(Base):
    __tablename__ = 'plots'
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    grower_id = Column(ForeignKey('users.id'), nullable=False)
    crop = Column(String, default='', nullable=False)
    area = Column(String, default='', nullable=False)
    position = Column(Integer, nullable=False)
    active = Column(Boolean, default=True, nullable=False)

class Day(Base):
    __tablename__ = 'days'
    date = Column(String, primary_key=True)
    state = Column(String, default='Planning', nullable=False)
    revision = Column(Integer, default=1, nullable=False)
    opening_ml = Column(Integer, nullable=False)
    flow_ml_min = Column(Integer, nullable=False)
    start = Column(Integer, nullable=False)
    end = Column(Integer, nullable=False)
    changeover = Column(Integer, nullable=False)
    timezone = Column(String, default='Asia/Bishkek', nullable=False)
    policy = Column(String, default='proportional', nullable=False)
    __table_args__ = (CheckConstraint('opening_ml >= 0 AND flow_ml_min > 0 AND start < end AND changeover >= 0'),)

class WaterRequest(Base):
    __tablename__ = 'requests'
    id = Column(Integer, primary_key=True)
    date = Column(ForeignKey('days.date'), nullable=False)
    plot_id = Column(ForeignKey('plots.id'), nullable=False)
    requested_ml = Column(Integer, nullable=False)
    start = Column(Integer, nullable=False)
    end = Column(Integer, nullable=False)
    note = Column(Text, default='', nullable=False)
    status = Column(String, default='pending', nullable=False)
    approved_ml = Column(Integer, default=0, nullable=False)
    minimum_ml = Column(Integer, default=0, nullable=False)
    reason = Column(Text, default='', nullable=False)
    submitted_at = Column(String, default=now, nullable=False)
    updated_at = Column(String, default=now, nullable=False)
    reviewer_id = Column(ForeignKey('users.id'))
    reviewed_at = Column(String)
    __table_args__ = (UniqueConstraint('date', 'plot_id'), CheckConstraint('0 <= minimum_ml AND minimum_ml <= approved_ml AND approved_ml <= requested_ml AND start < end'))

class Plan(Base):
    __tablename__ = 'plans'
    id = Column(Integer, primary_key=True)
    date = Column(ForeignKey('days.date'), nullable=False)
    revision = Column(Integer, nullable=False)
    status = Column(String, nullable=False)
    snapshot = Column(JSON, nullable=False)
    creator_id = Column(ForeignKey('users.id'), nullable=False)
    created_at = Column(String, default=now, nullable=False)
    published_at = Column(String)

class Turn(Base):
    __tablename__ = 'turns'
    id = Column(Integer, primary_key=True)
    plan_id = Column(ForeignKey('plans.id'), nullable=False)
    date = Column(ForeignKey('days.date'), nullable=False)
    plot_id = Column(ForeignKey('plots.id'), nullable=False)
    grower_id = Column(ForeignKey('users.id'), nullable=False)
    sequence = Column(Integer, nullable=False)
    allocated_ml = Column(Integer, nullable=False)
    target_ml = Column(Integer, nullable=False)
    start = Column(Integer, nullable=False)
    end = Column(Integer, nullable=False)
    state = Column(String, default='Planned', nullable=False)
    actual_ml = Column(Integer, default=0, nullable=False)
    actual_start = Column(String)
    actual_finish = Column(String)
    reason = Column(Text, default='', nullable=False)
    __table_args__ = (CheckConstraint('actual_ml >= 0 AND target_ml >= 0'), Index('one_active_hose', 'state', unique=True, sqlite_where=text("state = 'In progress'")))

class Adjustment(Base):
    __tablename__ = 'adjustments'
    id = Column(Integer, primary_key=True)
    date = Column(ForeignKey('days.date'), nullable=False)
    amount_ml = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    actor_id = Column(ForeignKey('users.id'), nullable=False)
    created_at = Column(String, default=now, nullable=False)

class Activity(Base):
    __tablename__ = 'activity'
    id = Column(Integer, primary_key=True)
    date = Column(ForeignKey('days.date'), nullable=False)
    actor_id = Column(ForeignKey('users.id'), nullable=False)
    action = Column(String, nullable=False)
    detail = Column(Text, nullable=False)
    data = Column(JSON, default=dict, nullable=False)
    created_at = Column(String, default=now, nullable=False)

class Operation(Base):
    __tablename__ = 'operations'
    key = Column(String, primary_key=True)
    actor_id = Column(ForeignKey('users.id'), nullable=False)
    fingerprint = Column(String, nullable=False)
    result = Column(JSON, nullable=False)
