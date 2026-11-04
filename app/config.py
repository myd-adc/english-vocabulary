"""Environment-driven configuration.

Read once at import time. Required variables fail fast with a clear message so a
misconfigured deploy shows up immediately in the Render logs.
Locally, load a .env file with: uvicorn app.main:app --env-file .env
"""

import os


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Environment variable {name} is not set (see .env.example)")
    return value


DATABASE_URL = _required("DATABASE_URL")
# Signing key for the MCP connector's own access tokens (not a password anyone types).
MCP_SECRET = _required("MCP_SECRET")

# Accounts: Supabase Auth issues the sign-in tokens, this server only verifies them.
# https://<project>.supabase.co, no trailing slash
SUPABASE_URL = _required("SUPABASE_URL").rstrip("/")
# Optional: HS256 secret for legacy Supabase projects (and the tests). New projects sign
# with an asymmetric key published at {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()
# Invite-only: comma-separated emails that may use the app (case-insensitive).
ALLOWED_EMAILS = frozenset(
    e.strip().lower() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()
)
# Words saved before accounts existed (user_id IS NULL) go to this person on their first request.
OWNER_EMAIL = os.getenv("OWNER_EMAIL", "").strip().lower()
# Public https URL of the service, no trailing slash, e.g. https://lexivocab.onrender.com
ISSUER_URL = os.getenv("ISSUER_URL", "http://localhost:8000").strip().rstrip("/")
PORT = int(os.getenv("PORT", "8000"))
# "Today" (for due dates) is computed in this timezone, not in the server's UTC.
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Europe/Kyiv")

MCP_PATH = "/mcp"

# Optional LLM for auto-translation and topics: any OpenAI-compatible chat API.
# Without LLM_API_KEY the app works and translations are entered by hand.
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
).strip()
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-flash-lite-latest").strip()
# Optional, for reasoning models (e.g. Groq's openai/gpt-oss-120b): "low" is faster and uses fewer tokens.
LLM_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "").strip()


def _llm_fallbacks() -> list[dict[str, str]]:
    """Backup LLMs tried in order when the main one is rate-limited or down: LLM_2_MODEL,
    LLM_2_API_KEY, LLM_2_BASE_URL, LLM_2_REASONING_EFFORT, then LLM_3_..., up to LLM_9_.
    A missing key or base URL is taken from the main LLM (e.g. another model on the same Groq key)."""
    out = []
    for i in range(2, 10):
        model = os.getenv(f"LLM_{i}_MODEL", "").strip()
        if model:
            out.append({
                "model": model,
                "api_key": os.getenv(f"LLM_{i}_API_KEY", "").strip(),
                "base_url": os.getenv(f"LLM_{i}_BASE_URL", "").strip(),
                "reasoning_effort": os.getenv(f"LLM_{i}_REASONING_EFFORT", "").strip(),
            })
    return out


LLM_FALLBACKS = _llm_fallbacks()
