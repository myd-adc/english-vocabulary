"""PWA authentication: password -> 30-day JWT (HS256), as in the original project."""

import hmac
import time
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Header, HTTPException

from app import config

_ALGORITHM = "HS256"
_EXPIRY_DAYS = 30

# Tiny in-memory brute-force guard for the login endpoint (single process).
_FAIL_WINDOW = 300
_FAIL_LIMIT = 10
_failures: list[float] = []


def check_password(candidate: str, expected: str) -> bool:
    return hmac.compare_digest(candidate.encode(), expected.encode())


def login_allowed() -> bool:
    cutoff = time.time() - _FAIL_WINDOW
    _failures[:] = [t for t in _failures if t > cutoff]
    return len(_failures) < _FAIL_LIMIT


def record_failure() -> None:
    _failures.append(time.time())


def create_token() -> str:
    payload = {"sub": "pwa", "exp": datetime.now(UTC) + timedelta(days=_EXPIRY_DAYS)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm=_ALGORITHM)


def verify_token(token: str) -> bool:
    try:
        jwt.decode(token, config.JWT_SECRET, algorithms=[_ALGORITHM], options={"require": ["exp"]})
        return True
    except jwt.PyJWTError:
        return False


def require_auth(authorization: str = Header("")) -> None:
    """FastAPI dependency: demands 'Authorization: Bearer <jwt>'."""
    if authorization.startswith("Bearer ") and verify_token(authorization[7:]):
        return
    raise HTTPException(status_code=401, detail="Unauthorized")
