"""Postgres access via psycopg 3 (no ORM) and idempotent schema creation."""

from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app import config

# Supabase (free tier) may drop idle connections; check_connection makes the pool
# transparently replace dead ones before handing them out. prepare_threshold=None
# disables server-side prepared statements so this also works behind a transaction pooler.
_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            config.DATABASE_URL,
            min_size=1,
            max_size=5,
            max_idle=240,
            max_lifetime=1800,
            check=ConnectionPool.check_connection,
            kwargs={"row_factory": dict_row, "autocommit": False, "prepare_threshold": None},
            open=False,
        )
        _pool.open(wait=True, timeout=30)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def ping() -> None:
    """Cheap DB round-trip (used by /health so the keep-alive ping also keeps Supabase awake)."""
    with connection() as conn:
        conn.execute("SELECT 1")


@contextmanager
def connection():
    """Yield a pooled connection; commits on success, rolls back on error."""
    with get_pool().connection() as conn:
        yield conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id                  SERIAL PRIMARY KEY,
    word                TEXT NOT NULL,
    translation         TEXT NOT NULL,
    transcription       TEXT,
    part_of_speech      TEXT,
    example             TEXT,
    example_translation TEXT,
    notes               TEXT,
    section             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- forward = EN -> UA
    interval            INTEGER NOT NULL DEFAULT 1,
    ease_factor         DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    repetitions         INTEGER NOT NULL DEFAULT 0,
    lapses              INTEGER NOT NULL DEFAULT 0,
    next_review         DATE NOT NULL DEFAULT CURRENT_DATE,
    -- reverse = UA -> EN (separate schedule)
    reverse_interval    INTEGER NOT NULL DEFAULT 1,
    reverse_ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    reverse_repetitions INTEGER NOT NULL DEFAULT 0,
    reverse_lapses      INTEGER NOT NULL DEFAULT 0,
    reverse_next_review DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS ix_words_section ON words (section);

CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id        TEXT PRIMARY KEY,
    client_secret    TEXT,
    client_info_json TEXT NOT NULL,
    created_at       DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
    code                             TEXT PRIMARY KEY,
    client_id                        TEXT NOT NULL,
    code_challenge                   TEXT NOT NULL,
    redirect_uri                     TEXT NOT NULL,
    redirect_uri_provided_explicitly BOOLEAN NOT NULL,
    scopes_json                      TEXT NOT NULL,
    expires_at                       DOUBLE PRECISION NOT NULL,
    resource                         TEXT
);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
    token       TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    expires_at  DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS oauth_revoked_tokens (
    jti        TEXT PRIMARY KEY,
    revoked_at DOUBLE PRECISION NOT NULL
);
"""


def init_db() -> None:
    """Create tables and indexes if missing. Safe to call on every startup."""
    with connection() as conn:
        # Serialise concurrent startups (e.g. during a rolling deploy).
        conn.execute("SELECT pg_advisory_xact_lock(727274)")
        conn.execute(SCHEMA)
        conn.execute("ALTER TABLE words ADD COLUMN IF NOT EXISTS main_translation TEXT")
        conn.execute("ALTER TABLE words ADD COLUMN IF NOT EXISTS definition TEXT")
        conn.execute("ALTER TABLE words ADD COLUMN IF NOT EXISTS definition_uk TEXT")
        # Per-person preferences, e.g. which language word explanations are shown in.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS user_settings ("
            "user_id UUID PRIMARY KEY, explain_lang TEXT NOT NULL DEFAULT 'uk')"
        )
        # Accounts: every word belongs to a Supabase user (NULL = saved before accounts existed,
        # claimed by OWNER_EMAIL on their first request). Uniqueness is per person now.
        conn.execute("ALTER TABLE words ADD COLUMN IF NOT EXISTS user_id UUID")
        conn.execute("DROP INDEX IF EXISTS uix_words_word_lower")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uix_words_user_word_lower ON words (user_id, lower(word))")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_words_user_section ON words (user_id, section)")
        # MCP connector: authorizations and refresh tokens remember whose account they belong to.
        conn.execute("ALTER TABLE oauth_auth_codes ADD COLUMN IF NOT EXISTS user_id TEXT")
        conn.execute("ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS user_id TEXT")
        # The Supabase publishable key ships in the browser bundle. Row Level Security with no
        # policies blocks the anon/authenticated roles from reading these tables through the
        # Supabase Data API; the app itself connects as the table owner and is not affected.
        for table in ("words", "user_settings", "oauth_clients", "oauth_auth_codes", "oauth_refresh_tokens",
                      "oauth_revoked_tokens"):
            conn.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
