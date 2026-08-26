import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import (get_current_user, hash_password, make_user_token,
                    verify_password)
from ..config import settings
from ..db import SessionLocal, get_db
from ..limits import (check_global_budget, check_user_limits, record_usage,
                      user_quota)
from ..models import Conversation, ConversationMessage, EndUser
from ..rag import (NOT_FOUND, build_messages, find_ruling, format_sources,
                   looks_not_found, retrieve, select_cited_sources)
from ..openai_client import chat_stream
from ..schemas import ChatRequest, TokenResponse, UserCredentials
from ..settings_store import get_setting

router = APIRouter(prefix="/api", tags=["chat"])


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    """Public: lets the app know whether to show the assistant at all."""
    return {"enabled": bool(get_setting(db, "assistant_enabled", True))}


@router.get("/ruling/{number}")
def get_ruling(number: int, user: EndUser = Depends(get_current_user),
               db: Session = Depends(get_db)):
    """Full text of a single ruling, so a citation in an answer can be opened
    and read in context. Gated exactly like chat."""
    if not bool(get_setting(db, "assistant_enabled", True)):
        raise HTTPException(status_code=403, detail="دستیار هوشمند در حال حاضر غیرفعال است.")
    if bool(get_setting(db, "require_auth", True)) and not user:
        raise HTTPException(status_code=401, detail="برای مشاهده ابتدا وارد شوید.")
    if number <= 0:
        raise HTTPException(status_code=400, detail="شماره نامعتبر است.")
    chunk = find_ruling(db, number)
    if not chunk:
        raise HTTPException(status_code=404, detail="متن این مسأله پیدا نشد.")
    body = chunk.content
    head, _, rest = body.partition("\n")
    return {"number": number, "title": head.strip(), "text": (rest or body).strip()}


MIN_USERNAME = 3
MAX_USERNAME = 40
MIN_PASSWORD = 6
HISTORY_TURNS = 6          # recent messages passed to the model as context

# نام کاربری در پنل ادمین نمایش داده می‌شود؛ اجازه‌ی نویسه‌های HTML داده نشود
# (بدون این محدودیت می‌شد با ثبت‌نام، اسکریپت را در پنل مدیر ذخیره کرد).
_USERNAME_RE = re.compile(r"^[\w.\-@ آ-ی\u200c]+$", re.UNICODE)


# ---------------- auth ----------------
@router.post("/auth/register", response_model=TokenResponse)
def register(payload: UserCredentials, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if len(username) < MIN_USERNAME:
        raise HTTPException(status_code=400, detail="نام کاربری حداقل ۳ نویسه باشد.")
    if len(username) > MAX_USERNAME:
        raise HTTPException(status_code=400, detail="نام کاربری حداکثر ۴۰ نویسه باشد.")
    if not _USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="نام کاربری فقط می‌تواند شامل حرف، رقم و . - _ @ باشد.")
    if len(payload.password) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail="رمز عبور حداقل ۶ نویسه باشد.")
    if db.query(EndUser).filter_by(username=username).first():
        raise HTTPException(status_code=400, detail="این نام کاربری قبلاً ثبت شده است.")
    user = EndUser(username=username, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(token=make_user_token(user.id))


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: UserCredentials, db: Session = Depends(get_db)):
    user = db.query(EndUser).filter_by(username=payload.username.strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="نام کاربری یا رمز عبور اشتباه است.")
    if user.blocked:
        raise HTTPException(status_code=403, detail="حساب شما مسدود شده است.")
    return TokenResponse(token=make_user_token(user.id))


@router.get("/me/quota")
def my_quota(user: EndUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="ابتدا وارد شوید.")
    return user_quota(db, user)


# ---------------- conversations ----------------
@router.get("/conversations")
def list_conversations(user: EndUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="ابتدا وارد شوید.")
    convs = (
        db.query(Conversation)
        .filter_by(user_id=user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(100).all()
    )
    return [{"id": c.id, "title": c.title or "گفتگو",
             "updated_at": c.updated_at.isoformat()} for c in convs]


@router.post("/conversations")
def create_conversation(user: EndUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="ابتدا وارد شوید.")
    c = Conversation(user_id=user.id, title="گفتگوی جدید")
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "title": c.title}


@router.get("/conversations/{cid}/messages")
def conversation_messages(cid: int, user: EndUser = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="ابتدا وارد شوید.")
    conv = db.query(Conversation).filter_by(id=cid, user_id=user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="گفتگو یافت نشد.")
    rows = (
        db.query(ConversationMessage)
        .filter_by(conversation_id=cid)
        .order_by(ConversationMessage.created_at.asc()).all()
    )
    return [{"role": r.role, "content": r.content, "sources": r.sources} for r in rows]


@router.delete("/conversations/{cid}")
def delete_conversation(cid: int, user: EndUser = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    if not user:
        raise HTTPException(status_code=401, detail="ابتدا وارد شوید.")
    conv = db.query(Conversation).filter_by(id=cid, user_id=user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="گفتگو یافت نشد.")
    db.query(ConversationMessage).filter_by(conversation_id=cid).delete()
    db.delete(conv)
    db.commit()
    return {"ok": True}


# ---------------- chat (streaming) ----------------
def _sse(obj) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@router.post("/chat")
def chat_endpoint(
    payload: ChatRequest,
    user: EndUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="سؤال خالی است.")

    if not bool(get_setting(db, "assistant_enabled", True)):
        raise HTTPException(status_code=403, detail="دستیار هوشمند در حال حاضر غیرفعال است.")

    require_auth = bool(get_setting(db, "require_auth", True))
    if require_auth and not user:
        raise HTTPException(status_code=401, detail="برای استفاده ابتدا وارد شوید.")

    check_global_budget(db)
    if user:
        check_user_limits(db, user)

    # resolve (or create) the conversation this message belongs to
    conv_id = None
    if user:
        conv = None
        if payload.conversation_id:
            conv = db.query(Conversation).filter_by(
                id=payload.conversation_id, user_id=user.id).first()
        if not conv:
            conv = Conversation(user_id=user.id, title=question[:40])
            db.add(conv)
            db.commit()
            db.refresh(conv)
        conv_id = conv.id
    user_id = user.id if user else None

    def gen():
        s = SessionLocal()
        try:
            yield _sse({"type": "meta", "conversation_id": conv_id})

            history = []
            if conv_id:
                history = list(reversed(
                    s.query(ConversationMessage)
                    .filter_by(conversation_id=conv_id)
                    .order_by(ConversationMessage.created_at.desc())
                    .limit(HISTORY_TURNS).all()
                ))

            prev_user = next((h.content for h in reversed(history) if h.role == "user"), None)
            retrieval_q = f"{prev_user}\n{question}" if prev_user else question

            chunks, primary_ids, emb_tokens = retrieve(s, retrieval_q)
            context, sources = format_sources(s, chunks, primary_ids)

            prices = get_setting(s, "model_prices", {})
            model = get_setting(s, "answer_model", "gpt-5.4-mini")
            temperature = float(get_setting(s, "temperature", 0.1))

            if user_id:
                s.add(ConversationMessage(user_id=user_id, conversation_id=conv_id,
                                          role="user", content=question))
                s.commit()

            def finish(full, p_tok, c_tok, found, store_sources):
                if user_id:
                    s.add(ConversationMessage(
                        user_id=user_id, conversation_id=conv_id, role="assistant",
                        content=full, sources=store_sources))
                    s.commit()
                    conv = s.query(Conversation).get(conv_id)
                    if conv:
                        conv.updated_at = datetime.utcnow()
                        s.commit()
                record_usage(s, user_id, question, full, model, prices,
                             p_tok, c_tok, emb_tokens, found)

            if not chunks:
                # small talk vs. real-but-missing question
                if not bool(get_setting(s, "smalltalk_enabled", True)):
                    yield _sse({"type": "delta", "text": NOT_FOUND})
                    finish(NOT_FOUND, 0, 0, False, None)
                    yield _sse({"type": "done"})
                    return
                persona = get_setting(s, "bot_persona", "یک دستیار پاسخگوی دوستانه")
                st_prompt = get_setting(s, "smalltalk_prompt", "").replace("{persona}", persona)
                st_messages = [{"role": "system", "content": st_prompt}]
                for h in history:
                    st_messages.append({"role": h.role, "content": h.content})
                st_messages.append({"role": "user", "content": question})
                full = ""
                p_tok = c_tok = 0
                for kind, val in chat_stream(model, st_messages, temperature):
                    if kind == "delta":
                        full += val
                        yield _sse({"type": "delta", "text": val})
                    elif kind == "usage":
                        p_tok, c_tok = val
                finish(full, p_tok, c_tok, not looks_not_found(full), None)
                yield _sse({"type": "done"})
                return

            messages = build_messages(s, history, context, question)
            full = ""
            p_tok = c_tok = 0
            for kind, val in chat_stream(model, messages, temperature):
                if kind == "delta":
                    full += val
                    yield _sse({"type": "delta", "text": val})
                elif kind == "usage":
                    p_tok, c_tok = val
            found = not looks_not_found(full)
            shown = select_cited_sources(full, sources) if found else []
            finish(full, p_tok, c_tok, found, shown or None)
            if found and shown:
                yield _sse({"type": "sources", "sources": shown})
            yield _sse({"type": "done"})
        except Exception as e:
            detail = str(e) if settings.DEBUG else "خطایی در پردازش پاسخ رخ داد."
            yield _sse({"type": "error", "detail": detail})
        finally:
            s.close()

    return StreamingResponse(gen(), media_type="text/event-stream")
