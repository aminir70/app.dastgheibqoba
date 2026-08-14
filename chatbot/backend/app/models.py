from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, JSON
)
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from .db import Base

# NOTE: must match defaults.embedding_dims. text-embedding-3-large is requested
# with dimensions=1536 so it fits within pgvector's HNSW index limit.
EMBEDDING_DIM = 1536


class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    mime = Column(String, nullable=False)
    status = Column(String, default="queued")     # queued | processing | ready | error
    error = Column(Text, nullable=True)
    pages = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    used_ocr = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    content = Column(Text, nullable=False)
    page = Column(Integer, nullable=True)
    token_count = Column(Integer, default=0)
    embedding = Column(Vector(EMBEDDING_DIM))

    document = relationship("Document", back_populates="chunks")


class EndUser(Base):
    __tablename__ = "end_users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    blocked = Column(Boolean, default=False)
    # per-user daily message cap override: NULL = use global default,
    # -1 = unlimited, N = custom cap
    daily_message_limit = Column(Integer, nullable=True)
    # per-user monthly token cap override: NULL = global default, -1 = unlimited
    monthly_token_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("end_users.id", ondelete="CASCADE"), index=True)
    title = Column(String, default="گفتگوی جدید")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("end_users.id", ondelete="CASCADE"), index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"),
                             index=True, nullable=True)
    role = Column(String, nullable=False)        # 'user' | 'assistant'
    content = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class UsageLog(Base):
    __tablename__ = "usage_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("end_users.id"), index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    question = Column(Text)
    answer_preview = Column(Text)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    embedding_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    found_answer = Column(Boolean, default=True)
