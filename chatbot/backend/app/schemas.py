from typing import Any, Optional
from pydantic import BaseModel


class AdminLogin(BaseModel):
    password: str


class UserCredentials(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[int] = None


class SettingsUpdate(BaseModel):
    # arbitrary key/value pairs of settings to update
    values: dict[str, Any]


class TokenResponse(BaseModel):
    token: str
