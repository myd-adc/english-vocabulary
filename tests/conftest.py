"""Test fixtures. Needs a Postgres database: set TEST_DATABASE_URL (see README, "Тести")."""

import os
import time

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres@localhost:5433/lexi_test?host=/tmp/pg"
)
os.environ["MCP_SECRET"] = "test-mcp-secret-0123456789abcdef0123456789"
os.environ["ISSUER_URL"] = "https://testserver"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-0123456789abcdef"
os.environ["ALLOWED_EMAILS"] = "Alice@Example.com, bob@example.com, owner@example.com"
os.environ["OWNER_EMAIL"] = "owner@example.com"

import jwt
import pytest
from fastapi.testclient import TestClient

ALICE = {"id": "11111111-1111-4111-8111-111111111111", "email": "alice@example.com"}
BOB = {"id": "22222222-2222-4222-8222-222222222222", "email": "bob@example.com"}
OWNER = {"id": "33333333-3333-4333-8333-333333333333", "email": "owner@example.com"}
STRANGER = {"id": "44444444-4444-4444-8444-444444444444", "email": "stranger@example.com"}


def make_token(user: dict, *, expires_in: int = 3600, secret: str | None = None, **overrides) -> str:
    """A Supabase-shaped access token (HS256, signed with the test SUPABASE_JWT_SECRET)."""
    claims = {
        "sub": user["id"],
        "email": user["email"],
        "aud": "authenticated",
        "iss": "https://test.supabase.co/auth/v1",
        "role": "authenticated",
        "exp": int(time.time()) + expires_in,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, secret or os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")


def bearer(user: dict) -> dict:
    return {"Authorization": f"Bearer {make_token(user)}"}


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app, base_url="https://testserver") as c:  # runs lifespan: init_db + MCP session manager
        yield c


@pytest.fixture(autouse=True)
def clean_db(client):
    from app import auth
    from app.db import connection

    with connection() as conn:
        conn.execute("TRUNCATE words RESTART IDENTITY")
        conn.execute("TRUNCATE oauth_auth_codes, oauth_refresh_tokens, oauth_revoked_tokens")
    auth._claimed.clear()


@pytest.fixture()
def headers():
    """Authorization header of the default test user, Alice."""
    return bearer(ALICE)


@pytest.fixture()
def bob_headers():
    return bearer(BOB)
