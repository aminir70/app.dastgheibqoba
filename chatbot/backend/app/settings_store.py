from sqlalchemy.orm import Session

from .models import AppSetting


def get_setting(db: Session, key: str, default=None):
    row = db.query(AppSetting).filter_by(key=key).first()
    return row.value if row else default


def get_all_settings(db: Session) -> dict:
    return {row.key: row.value for row in db.query(AppSetting).all()}


def set_setting(db: Session, key: str, value):
    row = db.query(AppSetting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        row = AppSetting(key=key, value=value)
        db.add(row)
    db.commit()
    return row
