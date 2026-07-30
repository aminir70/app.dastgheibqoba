from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Enable pgvector extension, create tables, seed default settings."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

    from . import models  # noqa: F401  (register models)
    Base.metadata.create_all(bind=engine)

    # Vector index for fast similarity search at scale (cosine).
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw "
            "ON chunks USING hnsw (embedding vector_cosine_ops)"
        ))
        # Migration: add conversation_id to existing message tables.
        conn.execute(text(
            "ALTER TABLE conversation_messages "
            "ADD COLUMN IF NOT EXISTS conversation_id INTEGER"
        ))
        conn.commit()

    _backfill_conversations()

    from .models import AppSetting
    from .defaults import DEFAULT_SETTINGS

    db = SessionLocal()
    try:
        for key, value in DEFAULT_SETTINGS.items():
            if not db.query(AppSetting).filter_by(key=key).first():
                db.add(AppSetting(key=key, value=value))
        db.commit()
    finally:
        db.close()


def _backfill_conversations():
    """Group any pre-existing messages (with no conversation) into one
    'previous conversation' per user, so old history shows in the list."""
    from .models import Conversation, ConversationMessage

    db = SessionLocal()
    try:
        user_ids = [
            r[0] for r in db.query(ConversationMessage.user_id)
            .filter(ConversationMessage.conversation_id.is_(None),
                    ConversationMessage.user_id.isnot(None))
            .distinct().all()
        ]
        for uid in user_ids:
            first = (
                db.query(ConversationMessage)
                .filter_by(user_id=uid, conversation_id=None)
                .order_by(ConversationMessage.created_at.asc())
                .first()
            )
            title = (first.content[:40] if first and first.content else "گفتگوی قبلی")
            conv = Conversation(user_id=uid, title=title)
            db.add(conv)
            db.commit()
            db.refresh(conv)
            db.query(ConversationMessage).filter_by(user_id=uid, conversation_id=None) \
                .update({ConversationMessage.conversation_id: conv.id})
            db.commit()
    finally:
        db.close()
