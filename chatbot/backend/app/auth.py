import hashlib
import hmac
import os
from datetime import datetime, timedelta

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import EndUser

JWT_ALG = "HS256"
USER_TOKEN_DAYS = 30
PBKDF2_ROUNDS = 200_000


# ---------- password hashing (stdlib, no extra dependency) ----------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), PBKDF2_ROUNDS
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ---------- JWT ----------
def make_user_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "role": "user",
        "exp": datetime.utcnow() + timedelta(days=USER_TOKEN_DAYS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALG)


def make_admin_token() -> str:
    payload = {
        "role": "admin",
        "exp": datetime.utcnow() + timedelta(days=1),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALG)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="توکن نامعتبر است")


# ---------- Dependencies ----------
def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> EndUser | None:
    """Returns the EndUser if a valid token is present, else None (anonymous).

    Two token shapes are accepted (both HS256 with the shared JWT_SECRET):
      1. Native chatbot token:  {"sub": "<id>", "role": "user"}
      2. Main-app (SSO) token:  {"uid": <id>, "username": "...", "kind": "user"}
         → the user is auto-provisioned on first use (no separate signup).
    """
    if not authorization.startswith("Bearer "):
        return None
    payload = _decode(authorization.split(" ", 1)[1])

    # native chatbot token
    if payload.get("role") == "user" and payload.get("sub"):
        return db.query(EndUser).get(int(payload["sub"]))

    # main-app SSO token
    if payload.get("kind") == "user" and payload.get("username"):
        username = str(payload["username"]).strip()
        if not username:
            return None
        user = db.query(EndUser).filter_by(username=username).first()
        if not user:
            user = EndUser(username=username,
                           password_hash=f"sso:{payload.get('uid', '')}")
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    return None


def require_admin(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="دسترسی مدیر لازم است")
    payload = _decode(authorization.split(" ", 1)[1])
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="دسترسی غیرمجاز")
    return True
