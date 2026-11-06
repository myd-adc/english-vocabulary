"""Supabase token verification, the email allowlist and /api/me."""

import time

import jwt
import pytest
from conftest import ALICE, BOB, OWNER, STRANGER, bearer, make_token
from cryptography.hazmat.primitives.asymmetric import ec


def test_no_token_is_401(client):
    assert client.get("/api/vocabulary").status_code == 401
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Basic abc"}).status_code == 401


@pytest.mark.parametrize(
    "token",
    [
        "junk",
        make_token(ALICE, expires_in=-60),
        make_token(ALICE, secret="x" * 40),
        make_token(ALICE, aud="anon"),
        make_token(ALICE, aud=None),
        make_token(ALICE, iss="https://evil.example/auth/v1"),
        make_token(ALICE, sub=None),
    ],
    ids=["junk", "expired", "wrong-signature", "wrong-aud", "no-aud", "wrong-issuer", "no-sub"],
)
def test_invalid_token_is_401(client, token):
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_unsigned_token_is_401(client):
    forged = jwt.encode({"sub": ALICE["id"], "email": ALICE["email"], "aud": "authenticated",
                         "iss": "https://test.supabase.co/auth/v1", "exp": int(time.time()) + 60},
                        key=None, algorithm="none")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_me_returns_id_and_email(client):
    r = client.get("/api/me", headers=bearer(ALICE))
    assert r.status_code == 200 and r.json() == ALICE | {"explain_lang": "uk"}


def test_allowlist_is_case_insensitive(client):
    # ALLOWED_EMAILS is configured as "Alice@Example.com"; tokens may carry any case
    token = make_token({**ALICE, "email": "ALICE@example.COM"})
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["email"] == "alice@example.com"


def test_email_outside_allowlist_is_403(client):
    r = client.get("/api/vocabulary", headers=bearer(STRANGER))
    assert r.status_code == 403 and r.json() == {"detail": "no_access"}
    assert client.get("/api/me", headers=bearer(STRANGER)).status_code == 403
    assert client.post("/api/vocabulary", json={"word": "a", "translation": "а"},
                       headers=bearer(STRANGER)).status_code == 403


def test_token_without_email_is_403(client):
    r = client.get("/api/me", headers={"Authorization": "Bearer " + make_token(ALICE, email=None)})
    assert r.status_code == 403


def test_old_password_login_is_gone(client):
    assert client.post("/api/auth/login", json={"password": "anything"}).status_code in (404, 405)


def test_asymmetric_token_verified_through_jwks(client, monkeypatch):
    """New Supabase projects sign with ES256; the key comes from the JWKS endpoint."""
    from app import auth

    key = ec.generate_private_key(ec.SECP256R1())

    class FakeJwks:
        def get_signing_key_from_jwt(self, token):
            class K:
                pass

            k = K()
            k.key = key.public_key()
            return k

    monkeypatch.setattr(auth, "_jwks_client", FakeJwks())
    claims = {"sub": BOB["id"], "email": BOB["email"], "aud": "authenticated",
              "iss": "https://test.supabase.co/auth/v1", "exp": int(time.time()) + 60}
    good = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "k1"})
    assert client.get("/api/me", headers={"Authorization": f"Bearer {good}"}).json() == BOB | {"explain_lang": "uk"}
    other = ec.generate_private_key(ec.SECP256R1())
    bad = jwt.encode(claims, other, algorithm="ES256", headers={"kid": "k1"})
    assert client.get("/api/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401


def test_jwks_outage_is_401_not_500(client, monkeypatch):
    from app import auth

    class Down:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientError("down")

    monkeypatch.setattr(auth, "_jwks_client", Down())
    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode({"sub": OWNER["id"], "aud": "authenticated", "exp": int(time.time()) + 60},
                       key, algorithm="ES256", headers={"kid": "k1"})
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
