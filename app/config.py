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
PWA_PASSWORD = _required("PWA_PASSWORD")
# OAuth login password for the MCP connector AND signing key for MCP access tokens.
MCP_SECRET = _required("MCP_SECRET")
# Signs the PWA's login JWT. Falls back to MCP_SECRET so one secret is enough.
JWT_SECRET = os.getenv("JWT_SECRET", "").strip() or MCP_SECRET
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
