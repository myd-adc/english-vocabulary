"""Post-deploy smoke test: health, OAuth metadata, MCP auth wall, DCR, authorize redirect to /connect.

    BASE_URL=https://your-app.onrender.com python tools/smoke_test.py

Non-destructive. Stops at the sign-in redirect: logging in needs a real Supabase account. Needs: pip install httpx
"""

import base64
import hashlib
import os
import secrets
import sys
from urllib.parse import parse_qs, urlparse

import httpx

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
REDIRECT = "https://claude.ai/api/mcp/auth_callback"
H = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def step(name, ok, extra=""):
    print(f"[{'OK' if ok else 'FAIL'}] {name} {extra}")
    if not ok:
        sys.exit(1)


c = httpx.Client(base_url=BASE, timeout=60)
r = c.get("/health")
step("GET /health", r.status_code == 200 and r.json() == {"status": "ok"})
step("oauth-authorization-server metadata", "registration_endpoint" in c.get("/.well-known/oauth-authorization-server").json())
step("oauth-protected-resource metadata", c.get("/.well-known/oauth-protected-resource/mcp").json()["resource"].endswith("/mcp"))
step("MCP without token -> 401", c.post("/mcp", headers=H, json={"jsonrpc": "2.0", "id": 1, "method": "ping"}).status_code == 401)

reg = c.post("/register", json={"redirect_uris": [REDIRECT], "client_name": "smoke", "token_endpoint_auth_method": "client_secret_post",
                                "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"]})
step("dynamic client registration", reg.status_code == 201)
cl = reg.json()
verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
r = c.get("/authorize", params={"response_type": "code", "client_id": cl["client_id"], "redirect_uri": REDIRECT,
                                "code_challenge": challenge, "code_challenge_method": "S256", "state": "s"})
loc = urlparse(r.headers.get("location", ""))
step("authorize -> sign-in page", r.status_code == 302 and loc.path == "/connect" and "request" in parse_qs(loc.query), loc.path)
step("/api/me without a token -> 401", c.get("/api/me").status_code == 401)
print("Sign-in is per person (Supabase), so the token exchange and tools are not exercised here. Covered by pytest.")
print("All good.")
