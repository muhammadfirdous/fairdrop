from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import select, delete
from .models import User, Plot, Day, WaterRequest, Activity, Operation, Adjustment, Turn, Plan, LoginSession
from .auth import passwords

DEMO_PASSWORD = 'GardenTogether!26'
DEMO_EMAIL = 'coordinator@fairdrop.local'
DEMAND = [60, 24, 48, 12, 36, 60]
WINDOWS = [(960,990),(975,1020),(985,1050),(1000,1020),(1000,1050),(1020,1080)]
NAMES = ['Aida', 'Bektur', 'Cholpon', 'Daniyar', 'Elmira', 'Farida']
CROPS = ['Tomatoes · basil', 'Carrots · radishes', 'Beans · courgettes', 'Salad greens', 'Peppers · herbs', 'Squash · sunflowers']

def today():
    return datetime.now(ZoneInfo('Asia/Bishkek')).date().isoformat()

def seed(db, date=None):
    date = date or today()
    coordinator = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if not coordinator:
        coordinator = User(email=DEMO_EMAIL, name='Mira Asanova', role='coordinator', password_hash=passwords.hash(DEMO_PASSWORD))
        db.add(coordinator)
        db.flush()
    for i, letter in enumerate('ABCDEF'):
        email = f'grower.{letter.lower()}@fairdrop.local'
        user = db.scalar(select(User).where(User.email == email))
        if not user:
            user = User(email=email, name=NAMES[i], role='grower', password_hash=passwords.hash(DEMO_PASSWORD))
            db.add(user)
            db.flush()
        if not db.get(Plot, letter):
            db.add(Plot(id=letter, name=f'Plot {letter}', grower_id=user.id, crop=CROPS[i], area=str([18,12,16,8,14,20][i]), position=i))
    db.flush()
    if db.get(Day, date):
        return date
    day = Day(date=date, opening_ml=160000, flow_ml_min=2000, start=57600, end=64800, changeover=120)
    db.add(day)
    db.flush()
    for i, letter in enumerate('ABCDEF'):
        db.add(WaterRequest(date=date, plot_id=letter, requested_ml=DEMAND[i]*1000, approved_ml=DEMAND[i]*1000,
                            minimum_ml=[12,6,12,6,6,18][i]*1000, start=WINDOWS[i][0]*60, end=WINDOWS[i][1]*60,
                            status='approved', submitted_at=f'{date}T08:{i:02}:00+06:00', reviewer_id=coordinator.id,
                            reviewed_at=f'{date}T09:00:00+06:00', note='Fictional demonstration request.'))
    db.add(Activity(date=date, actor_id=coordinator.id, action='Seeded demo', detail='Fictional Ak-Bulak community: six approved requests, 160 L source budget.', data={}))
    return date

def reset(db, date=None):
    for model in (Operation, Activity, Adjustment, Turn, Plan, WaterRequest, Day, LoginSession, Plot, User):
        db.execute(delete(model))
    return seed(db, date)
