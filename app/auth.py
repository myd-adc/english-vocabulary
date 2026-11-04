"""Accounts: verify Supabase Auth access tokens and apply the invite-only allowlist.

The PWA signs people in with Supabase (email + password, Google) and sends the resulting
access token as `Authorization: Bearer <jwt>`. This module never mints tokens for people.
"""

import threading
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from app import config, vocab

_AUDIENCE = "authenticated"
_ASYMMETRIC = ("ES256", "RS256")

# JWKS keys are cached by PyJWKClient and refetched when a token names an unknown `kid`.
_jwks_client: PyJWKClient | None = None
_jwks_lock = threading.Lock()

# Users whose pre-account words were already claimed in this process (OWNER_EMAIL only).
_claimed: set[str] = set()


@dataclass(frozen=True)
class User:
    id: str
    email: str


def _issuer() -> str:
    return f"{config.SUPABASE_URL}/auth/v1"


def _jwks() -> PyJWKClient:
    global _jwks_client
    with _jwks_lock:
        if _jwks_client is None:
            _jwks_client = PyJWKClient(
                f"{_issuer()}/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=10
            )
        return _jwks_client


def _decode(token: str) -> dict:
    """Verify signature, expiry, audience and issuer; returns the claims or raises jwt.PyJWTError."""
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256" and config.SUPABASE_JWT_SECRET:
        key: object = config.SUPABASE_JWT_SECRET
    elif alg in _ASYMMETRIC:
        key = _jwks().get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidAlgorithmError(f"Unsupported algorithm: {alg}")
    return jwt.decode(
        token,
        key,
        algorithms=[alg],
        audience=_AUDIENCE,
        issuer=_issuer(),
        options={"require": ["exp", "sub", "aud", "iss"]},
    )


def user_from_token(token: str) -> User:
    """Token -> allowed user. Raises 401 for a bad token, 403 `no_access` for an email off the list."""
    try:
        claims = _decode(token)
    except jwt.PyJWTError as err:  # includes JWKS fetch failures
        raise HTTPException(status_code=401, detail="Unauthorized") from err
    email = str(claims.get("email") or "").strip().lower()
    if not email or email not in config.ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="no_access")
    user = User(id=str(claims["sub"]), email=email)
    _claim_legacy_words(user)
    return user


def _claim_legacy_words(user: User) -> None:
    """The owner inherits the words saved before accounts existed (once per process)."""
    if not config.OWNER_EMAIL or user.email != config.OWNER_EMAIL or user.id in _claimed:
        return
    vocab.claim_unowned(user.id)
    _claimed.add(user.id)


def require_auth(authorization: str = Header("")) -> User:
    """FastAPI dependency: demands 'Authorization: Bearer <supabase jwt>' of an allowed person."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user_from_token(authorization[7:])
