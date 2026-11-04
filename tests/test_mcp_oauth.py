"""End-to-end OAuth 2.1 (DCR + PKCE) flow against the MCP endpoint, then tool calls."""

import base64
import hashlib
import json
import secrets
from urllib.parse import parse_qs, urlparse

import pytest

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
REDIRECT = "https://claude.ai/api/mcp/auth_callback"


def rpc(client, token, method, params=None, id_=1):
    r = client.post(
        "/mcp",
        headers={**MCP_HEADERS, "Authorization": f"Bearer {token}"},
        json={"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}},
    )
    assert r.status_code == 200, r.text
    text = r.text
    if r.headers["content-type"].startswith("text/event-stream"):
        text = next(line[6:] for line in text.splitlines() if line.startswith("data: "))
    return json.loads(text)


def oauth_login(client, password="test-mcp-secret"):
    reg = client.post("/register", json={
        "redirect_uris": [REDIRECT], "client_name": "claude", "token_endpoint_auth_method": "client_secret_post",
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
    })
    assert reg.status_code == 201, reg.text
    info = reg.json()
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    r = client.get("/authorize", params={
        "response_type": "code", "client_id": info["client_id"], "redirect_uri": REDIRECT,
        "code_challenge": challenge, "code_challenge_method": "S256", "state": "xyz",
        "resource": "https://testserver/mcp",
    }, follow_redirects=False)
    assert r.status_code == 302
    login_url = r.headers["location"]
    assert "/authorize/submit" in login_url
    nonce = parse_qs(urlparse(login_url).query)["auth_params"][0]
    assert "<form" in client.get("/authorize/submit", params={"auth_params": nonce}).text
    sub = client.post("/authorize/submit", data={"auth_params": nonce, "password": password}, follow_redirects=False)
    return info, verifier, nonce, sub


def test_metadata(client):
    meta = client.get("/.well-known/oauth-authorization-server").json()
    assert meta["registration_endpoint"].endswith("/register")
    assert meta["code_challenge_methods_supported"] == ["S256"]
    prm = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert prm["resource"] == "https://testserver/mcp"
    assert client.get("/.well-known/oauth-protected-resource").json()["resource"] == "https://testserver/mcp"


def test_mcp_requires_token(client):
    r = client.post("/mcp", headers=MCP_HEADERS, json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert r.status_code == 401
    assert "resource_metadata" in r.headers["www-authenticate"]


def test_wrong_password_rejected(client):
    _, _, nonce, sub = oauth_login(client, password="wrong")
    assert sub.status_code == 401
    assert "Невірний пароль" in sub.text


def test_full_flow_and_tools(client):
    info, verifier, _, sub = oauth_login(client)
    assert sub.status_code == 302
    cb = urlparse(sub.headers["location"])
    q = parse_qs(cb.query)
    assert q["state"] == ["xyz"]
    tok = client.post("/token", data={
        "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": REDIRECT,
        "client_id": info["client_id"], "client_secret": info["client_secret"], "code_verifier": verifier,
    })
    assert tok.status_code == 200, tok.text
    access = tok.json()["access_token"]

    init = rpc(client, access, "initialize", {
        "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})
    assert init["result"]["serverInfo"]["name"] == "lexivocab"
    tools = {t["name"] for t in rpc(client, access, "tools/list", id_=2)["result"]["tools"]}
    assert tools == {"add_words", "list_words", "update_word", "delete_word", "list_sections", "get_stats"}

    def call(name, args):
        res = rpc(client, access, "tools/call", {"name": name, "arguments": args}, id_=3)["result"]
        assert not res.get("isError"), res
        return res["content"][0]["text"]

    out = call("add_words", {"words": [
        {"word": "Borrow", "translation": "позичати", "part_of_speech": "verb"},
        {"word": "lend", "translation": "позичити"}], "section_name": "Money"})
    assert out.startswith("Saved 2")
    assert "Skipped 1" in call("add_words", {"words": [{"word": "BORROW", "translation": "x"}]})
    listing = call("list_words", {"section_name": "Money"})
    assert "ease 2.50" in listing and "lapses 0" in listing and "Borrow" in listing
    client.patch("/api/vocabulary/1/review", json={"quality": 0},
                 headers={"Authorization": "Bearer " + client.post("/api/auth/login", json={"password": "test-password"}).json()["token"]})
    client.patch("/api/vocabulary/1/review", json={"quality": 0},
                 headers={"Authorization": "Bearer " + client.post("/api/auth/login", json={"password": "test-password"}).json()["token"]})
    hard = call("list_words", {"only_difficult": True})
    assert "Borrow" in hard and "lend" not in hard
    assert "lend" in call("list_words", {"only_due": True})
    assert "Updated" in call("update_word", {"word": "lend", "translation": "давати в борг", "notes": "n"})
    assert "Money: 2 words" in call("list_sections", {})
    assert "Total: 2" in call("get_stats", {})
    assert "Deleted" in call("delete_word", {"word": "lend"})
    assert "Total: 1" in call("get_stats", {})

    # refresh-token rotation
    rt = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": tok.json()["refresh_token"],
                                     "client_id": info["client_id"], "client_secret": info["client_secret"]})
    assert rt.status_code == 200
    again = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": tok.json()["refresh_token"],
                                        "client_id": info["client_id"], "client_secret": info["client_secret"]})
    assert again.status_code == 400  # old refresh token was rotated away

    # revocation
    client.post("/revoke", data={"token": access, "client_id": info["client_id"], "client_secret": info["client_secret"]})
    r = client.post("/mcp", headers={**MCP_HEADERS, "Authorization": f"Bearer {access}"},
                    json={"jsonrpc": "2.0", "id": 9, "method": "tools/list"})
    assert r.status_code == 401
