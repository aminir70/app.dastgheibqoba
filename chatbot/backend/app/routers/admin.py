import os
import uuid
from datetime import datetime

from fastapi import (APIRouter, Body, Depends, File, HTTPException, UploadFile)
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import make_admin_token, require_admin
from ..config import settings
from ..db import get_db
from ..models import Chunk, Document, EndUser, UsageLog
from ..schemas import AdminLogin, SettingsUpdate, TokenResponse
from ..settings_store import get_all_settings, set_setting
from ..worker import enqueue_ingest

router = APIRouter(prefix="/api/admin", tags=["admin"])

ALLOWED_EXT = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}


@router.post("/login", response_model=TokenResponse)
def login(payload: AdminLogin):
    if payload.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="رمز عبور اشتباه است.")
    return TokenResponse(token=make_admin_token())


# ---------- files ----------
@router.get("/files")
def list_files(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [{
        "id": d.id, "filename": d.filename, "status": d.status,
        "pages": d.pages, "chunks": d.chunk_count, "used_ocr": d.used_ocr,
        "error": d.error, "created_at": d.created_at.isoformat(),
    } for d in docs]


@router.post("/files")
async def upload_file(
    _: bool = Depends(require_admin),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"پسوند پشتیبانی نمی‌شود: {ext}")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    stored = os.path.join(settings.UPLOAD_DIR, f"{uuid.uuid4().hex}{ext}")

    size = 0
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    with open(stored, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                f.close()
                os.remove(stored)
                raise HTTPException(status_code=413, detail="حجم فایل بیش از حد مجاز است.")
            f.write(chunk)

    doc = Document(
        filename=file.filename,
        stored_path=stored,
        mime=file.content_type or "application/octet-stream",
        status="queued",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    enqueue_ingest(doc.id)
    return {"id": doc.id, "status": "queued"}


@router.delete("/files/{doc_id}")
def delete_file(doc_id: int, _: bool = Depends(require_admin), db: Session = Depends(get_db)):
    doc = db.query(Document).get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="فایل یافت نشد.")
    try:
        if os.path.exists(doc.stored_path):
            os.remove(doc.stored_path)
    except OSError:
        pass
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ---------- settings ----------
@router.get("/settings")
def read_settings(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    return get_all_settings(db)


@router.put("/settings")
def update_settings(payload: SettingsUpdate, _: bool = Depends(require_admin),
                    db: Session = Depends(get_db)):
    for key, value in payload.values.items():
        set_setting(db, key, value)
    return get_all_settings(db)


# ---------- users ----------
@router.get("/users")
def list_users(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(EndUser).order_by(EndUser.created_at.desc()).limit(500).all()
    out = []
    for u in users:
        msgs = db.query(func.count(UsageLog.id)).filter(UsageLog.user_id == u.id).scalar()
        out.append({
            "id": u.id, "username": u.username, "blocked": u.blocked,
            "total_messages": int(msgs), "created_at": u.created_at.isoformat(),
            "daily_message_limit": u.daily_message_limit,
        })
    return out


@router.post("/users/{user_id}/toggle-block")
def toggle_block(user_id: int, _: bool = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.query(EndUser).get(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد.")
    u.blocked = not u.blocked
    db.commit()
    return {"id": u.id, "blocked": u.blocked}


@router.put("/users/{user_id}/limit")
def set_user_limit(user_id: int,
                   daily_message_limit: int | None = Body(None, embed=True),
                   _: bool = Depends(require_admin), db: Session = Depends(get_db)):
    """Set a per-user daily message cap. null = use global default,
    -1 = unlimited, N = custom cap."""
    u = db.query(EndUser).get(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد.")
    u.daily_message_limit = daily_message_limit
    db.commit()
    return {"id": u.id, "daily_message_limit": u.daily_message_limit}


# ---------- usage / stats ----------
@router.get("/stats")
def stats(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    start_day = datetime(now.year, now.month, now.day)
    start_month = datetime(now.year, now.month, 1)

    spent_today = db.query(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)) \
        .filter(UsageLog.created_at >= start_day).scalar()
    spent_month = db.query(func.coalesce(func.sum(UsageLog.cost_usd), 0.0)) \
        .filter(UsageLog.created_at >= start_month).scalar()
    msgs_today = db.query(func.count(UsageLog.id)) \
        .filter(UsageLog.created_at >= start_day).scalar()
    total_users = db.query(func.count(EndUser.id)).scalar()
    total_docs = db.query(func.count(Document.id)).filter(Document.status == "ready").scalar()
    total_chunks = db.query(func.count(Chunk.id)).scalar()
    not_found = db.query(func.count(UsageLog.id)) \
        .filter(UsageLog.created_at >= start_month, UsageLog.found_answer == False).scalar()  # noqa: E712

    return {
        "spent_today_usd": round(float(spent_today), 4),
        "spent_month_usd": round(float(spent_month), 4),
        "messages_today": int(msgs_today),
        "total_users": int(total_users),
        "ready_documents": int(total_docs),
        "total_chunks": int(total_chunks),
        "unanswered_this_month": int(not_found),
    }
