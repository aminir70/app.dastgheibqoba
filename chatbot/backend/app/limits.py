from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import EndUser, UsageLog
from .openai_client import estimate_cost
from .settings_store import get_setting


def _start_of_day():
    now = datetime.utcnow()
    return datetime(now.year, now.month, now.day)


def _start_of_month():
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def check_global_budget(db: Session):
    budget = float(get_setting(db, "global_daily_budget_usd", 10.0))
    spent = (
        db.query(func.coalesce(func.sum(UsageLog.cost_usd), 0.0))
        .filter(UsageLog.created_at >= _start_of_day())
        .scalar()
    )
    if spent >= budget:
        raise HTTPException(
            status_code=429,
            detail="سقف بودجه‌ی روزانه‌ی سرویس پر شده است. لطفاً فردا دوباره تلاش کنید.",
        )


def _daily_max_for(db: Session, user: EndUser) -> int:
    """Per-user override wins over the global default.
    NULL -> global default; -1 (or any negative) -> unlimited."""
    override = getattr(user, "daily_message_limit", None)
    if override is not None:
        return int(override)
    return int(get_setting(db, "per_user_daily_messages", 20))


def check_user_limits(db: Session, user: EndUser):
    if user.blocked:
        raise HTTPException(status_code=403, detail="حساب شما مسدود شده است.")

    daily_max = _daily_max_for(db, user)
    monthly_token_max = int(get_setting(db, "per_user_monthly_tokens", 100000))

    if daily_max >= 0:  # negative = unlimited
        msgs_today = (
            db.query(func.count(UsageLog.id))
            .filter(UsageLog.user_id == user.id, UsageLog.created_at >= _start_of_day())
            .scalar()
        )
        if msgs_today >= daily_max:
            raise HTTPException(
                status_code=429,
                detail=f"به سقف روزانه ({daily_max} پیام) رسیدید. فردا دوباره امتحان کنید.",
            )

    tokens_month = (
        db.query(
            func.coalesce(
                func.sum(UsageLog.prompt_tokens + UsageLog.completion_tokens), 0
            )
        )
        .filter(UsageLog.user_id == user.id, UsageLog.created_at >= _start_of_month())
        .scalar()
    )
    if tokens_month >= monthly_token_max:
        raise HTTPException(
            status_code=429,
            detail="به سقف توکن ماهانه رسیدید.",
        )


def user_quota(db: Session, user: EndUser) -> dict:
    daily_max = _daily_max_for(db, user)
    monthly_token_max = int(get_setting(db, "per_user_monthly_tokens", 100000))
    msgs_today = (
        db.query(func.count(UsageLog.id))
        .filter(UsageLog.user_id == user.id, UsageLog.created_at >= _start_of_day())
        .scalar()
    )
    tokens_month = (
        db.query(
            func.coalesce(
                func.sum(UsageLog.prompt_tokens + UsageLog.completion_tokens), 0
            )
        )
        .filter(UsageLog.user_id == user.id, UsageLog.created_at >= _start_of_month())
        .scalar()
    )
    return {
        "daily_messages_used": int(msgs_today),
        "daily_messages_max": daily_max,
        "monthly_tokens_used": int(tokens_month),
        "monthly_tokens_max": monthly_token_max,
    }


def record_usage(db: Session, user_id, question, answer, model, prices,
                 prompt_tokens, completion_tokens, embedding_tokens, found):
    cost = estimate_cost(prices, model, prompt_tokens, completion_tokens)
    emb_model = get_setting(db, "embedding_model", "text-embedding-3-large")
    cost += estimate_cost(prices, emb_model, embedding_tokens, 0)
    log = UsageLog(
        user_id=user_id,
        question=question[:2000],
        answer_preview=(answer or "")[:500],
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        embedding_tokens=embedding_tokens,
        cost_usd=cost,
        found_answer=found,
    )
    db.add(log)
    db.commit()
    return cost
