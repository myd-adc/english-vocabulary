"""Test fixtures. Needs a Postgres database: set TEST_DATABASE_URL (see README, "Тести")."""

import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres@localhost:5433/lexi_test?host=/tmp/pg"
)
os.environ["PWA_PASSWORD"] = "test-password"
os.environ["MCP_SECRET"] = "test-mcp-secret"
os.environ["ISSUER_URL"] = "https://testserver"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app, base_url="https://testserver") as c:  # runs lifespan: init_db + MCP session manager
        yield c


@pytest.fixture(autouse=True)
def clean_db(client):
    from app.db import connection

    with connection() as conn:
        conn.execute("TRUNCATE words RESTART IDENTITY")
    from app import auth

    auth._failures.clear()


@pytest.fixture()
def headers(client):
    token = client.post("/api/auth/login", json={"password": "test-password"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}
