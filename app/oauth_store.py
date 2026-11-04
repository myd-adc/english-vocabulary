"""Postgres persistence for OAuth clients, authorization codes and tokens.

Same operations as the original SQLite module (mcp-server/database.py), ported to psycopg.
"""

import time

from app.db import connection


def save_client(client_id: str, client_secret: str | None, client_info_json: str) -> None:
    with connection() as conn:
        conn.execute(
            """INSERT INTO oauth_clients (client_id, client_secret, client_info_json, created_at)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (client_id) DO UPDATE SET client_secret = EXCLUDED.client_secret,
                   client_info_json = EXCLUDED.client_info_json""",
            [client_id, client_secret, client_info_json, time.time()],
        )


def get_client(client_id: str) -> dict | None:
    with connection() as conn:
        return conn.execute("SELECT * FROM oauth_clients WHERE client_id = %s", [client_id]).fetchone()


def save_auth_code(code: str, client_id: str, code_challenge: str, redirect_uri: str,
                   redirect_uri_provided_explicitly: bool, scopes_json: str,
                   expires_at: float, resource: str | None, user_id: str) -> None:
    with connection() as conn:
        conn.execute(
            """INSERT INTO oauth_auth_codes (code, client_id, code_challenge, redirect_uri,
                   redirect_uri_provided_explicitly, scopes_json, expires_at, resource, user_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [code, client_id, code_challenge, redirect_uri, redirect_uri_provided_explicitly,
             scopes_json, expires_at, resource, user_id],
        )
        conn.execute("DELETE FROM oauth_auth_codes WHERE expires_at < %s", [time.time()])


def get_auth_code(code: str) -> dict | None:
    with connection() as conn:
        return conn.execute("SELECT * FROM oauth_auth_codes WHERE code = %s", [code]).fetchone()


def delete_auth_code(code: str) -> None:
    with connection() as conn:
        conn.execute("DELETE FROM oauth_auth_codes WHERE code = %s", [code])


def save_refresh_token(token: str, client_id: str, scopes_json: str, expires_at: int | None,
                       user_id: str | None) -> None:
    with connection() as conn:
        conn.execute(
            """INSERT INTO oauth_refresh_tokens (token, client_id, scopes_json, expires_at, user_id)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (token) DO UPDATE SET client_id = EXCLUDED.client_id,
                   scopes_json = EXCLUDED.scopes_json, expires_at = EXCLUDED.expires_at,
                   user_id = EXCLUDED.user_id""",
            [token, client_id, scopes_json, expires_at, user_id],
        )
        conn.execute(
            "DELETE FROM oauth_refresh_tokens WHERE expires_at IS NOT NULL AND expires_at < %s",
            [time.time()],
        )


def get_refresh_token(token: str) -> dict | None:
    with connection() as conn:
        return conn.execute("SELECT * FROM oauth_refresh_tokens WHERE token = %s", [token]).fetchone()


def delete_refresh_token(token: str) -> None:
    with connection() as conn:
        conn.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", [token])


def save_revoked_token(jti: str) -> None:
    with connection() as conn:
        conn.execute(
            "INSERT INTO oauth_revoked_tokens (jti, revoked_at) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [jti, time.time()],
        )


def is_token_revoked(jti: str) -> bool:
    with connection() as conn:
        return conn.execute("SELECT 1 FROM oauth_revoked_tokens WHERE jti = %s", [jti]).fetchone() is not None
