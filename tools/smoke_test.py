"""Post-deploy smoke test: health, OAuth metadata, DCR, OAuth+PKCE login, MCP initialize + tools/list.

    BASE_URL=https://your-app.onrender.com MCP_SECRET=... python tools/smoke_test.py

Non-destructive (only reads). Needs: pip install httpx
"""

import base64
import hashlib
import json
import os
import secrets
import sys
from urllib.parse import parse_qs, urlparse

import httpx

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
SECRET = os.environ["MCP_SECRET"]
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
nonce = parse_qs(urlparse(r.headers["location"]).query)["auth_params"][0]
r = c.post("/authorize/submit", data={"auth_params": nonce, "password": SECRET})
step("authorize + password", r.status_code == 302)
code = parse_qs(urlparse(r.headers["location"]).query)["code"][0]
tok = c.post("/token", data={"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT, "client_id": cl["client_id"],
                             "client_secret": cl["client_secret"], "code_verifier": verifier})
step("token exchange (PKCE)", tok.status_code == 200)
auth = {**H, "Authorization": f"Bearer {tok.json()['access_token']}"}


def rpc(method, params=None, i=1):
    r = c.post("/mcp", headers=auth, json={"jsonrpc": "2.0", "id": i, "method": method, "params": params or {}})
    text = r.text
    if r.headers["content-type"].startswith("text/event-stream"):
        text = next(l[6:] for l in text.splitlines() if l.startswith("data: "))
    return json.loads(text)


step("MCP initialize", rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "smoke", "version": "1"}})["result"]["serverInfo"]["name"] == "lexivocab")
names = [t["name"] for t in rpc("tools/list", i=2)["result"]["tools"]]
step("MCP tools/list", len(names) == 6, str(names))
stats = rpc("tools/call", {"name": "get_stats", "arguments": {}}, 3)["result"]["content"][0]["text"]
step("MCP get_stats", stats.startswith("Total:"), stats)
print("All good.")
