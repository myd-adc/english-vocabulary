"""End-to-end OAuth 2.1 (DCR + PKCE + per-person sign-in) flow against the MCP endpoint, then tool calls."""

import base64
import hashlib
import json
import secrets
import time
from urllib.parse import parse_qs, urlparse

import pytest
from conftest import ALICE, BOB, STRANGER, bearer

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
REDIRECT = "https://claude.ai/api/mcp/auth_callback"


@pytest.fixture()
def as_alice(monkeypatch):
    """Direct calls of the tool functions have no HTTP request; pretend Alice's token is in context."""
    from app import mcp_tools

    monkeypatch.setattr(mcp_tools, "_current_user", lambda: ALICE["id"])


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


def start_authorization(client):
    """Register a client and hit /authorize; returns (client info, PKCE verifier, request id)."""
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
    loc = urlparse(r.headers["location"])
    assert f"{loc.scheme}://{loc.netloc}{loc.path}" == "https://testserver/connect"
    return info, verifier, parse_qs(loc.query)["request"][0]


def connect(client, request_id, user=ALICE):
    return client.post("/api/connect", json={"request": request_id}, headers=bearer(user))


def get_tokens(client, user=ALICE):
    """Full OAuth dance for one person; returns (tokens json, client info)."""
    info, verifier, request_id = start_authorization(client)
    r = connect(client, request_id, user)
    assert r.status_code == 200, r.text
    cb = urlparse(r.json()["redirect_url"])
    assert f"{cb.scheme}://{cb.netloc}{cb.path}" == REDIRECT
    q = parse_qs(cb.query)
    assert q["state"] == ["xyz"]
    tok = client.post("/token", data={
        "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": REDIRECT,
        "client_id": info["client_id"], "client_secret": info["client_secret"], "code_verifier": verifier,
    })
    assert tok.status_code == 200, tok.text
    return tok.json(), info


def init_session(client, access):
    return rpc(client, access, "initialize", {
        "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}})


def tool(client, access, name, args):
    res = rpc(client, access, "tools/call", {"name": name, "arguments": args}, id_=3)["result"]
    assert not res.get("isError"), res
    return res["content"][0]["text"]


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


def test_password_page_is_gone(client):
    from app.main import app

    assert not [r for r in app.router.routes if getattr(r, "path", "").startswith("/authorize/submit")]


def test_connect_requires_a_valid_allowed_account(client):
    _, _, request_id = start_authorization(client)
    assert client.post("/api/connect", json={"request": request_id}).status_code == 401
    r = connect(client, request_id, STRANGER)
    assert r.status_code == 403 and r.json() == {"detail": "no_access"}
    # a refused attempt does not burn the request: the right person can still finish
    assert connect(client, request_id, ALICE).status_code == 200


def test_connect_unknown_or_reused_request(client):
    assert connect(client, "nope").status_code == 404
    _, _, request_id = start_authorization(client)
    assert connect(client, request_id).status_code == 200
    assert connect(client, request_id).status_code == 404  # single use


def test_full_flow_and_tools(client):
    tok, info = get_tokens(client)
    access = tok["access_token"]
    init = init_session(client, access)
    assert init["result"]["serverInfo"]["name"] == "glossa"
    tools = {t["name"] for t in rpc(client, access, "tools/list", id_=2)["result"]["tools"]}
    assert tools == {"add_words", "list_words", "update_word", "delete_word", "list_sections", "get_stats"}

    def call(name, args):
        return tool(client, access, name, args)

    out = call("add_words", {"words": [
        {"word": "Borrow", "translation": "позичати", "part_of_speech": "verb"},
        {"word": "lend", "translation": "позичити"}], "section_name": "Money"})
    assert out.startswith("Saved 2")
    assert "Skipped 1" in call("add_words", {"words": [{"word": "BORROW", "translation": "x"}]})
    listing = call("list_words", {"section_name": "Money"})
    assert "ease 2.50" in listing and "lapses 0" in listing and "Borrow" in listing
    for _ in range(2):
        client.patch("/api/vocabulary/1/review", json={"quality": 0}, headers=bearer(ALICE))
    hard = call("list_words", {"only_difficult": True})
    assert "Borrow" in hard and "lend" not in hard
    assert "lend" in call("list_words", {"only_due": True})
    assert "Updated" in call("update_word", {"word": "lend", "translation": "давати в борг", "notes": "n"})
    assert "Money: 2 words" in call("list_sections", {})
    assert "Total: 2" in call("get_stats", {})
    assert "Deleted" in call("delete_word", {"word": "lend"})
    assert "Total: 1" in call("get_stats", {})

    # refresh-token rotation
    rt = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"],
                                     "client_id": info["client_id"], "client_secret": info["client_secret"]})
    assert rt.status_code == 200
    again = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": tok["refresh_token"],
                                        "client_id": info["client_id"], "client_secret": info["client_secret"]})
    assert again.status_code == 400  # old refresh token was rotated away

    # revocation
    client.post("/revoke", data={"token": access, "client_id": info["client_id"], "client_secret": info["client_secret"]})
    r = client.post("/mcp", headers={**MCP_HEADERS, "Authorization": f"Bearer {access}"},
                    json={"jsonrpc": "2.0", "id": 9, "method": "tools/list"})
    assert r.status_code == 401


def test_each_connector_sees_only_its_owner(client):
    alice, _ = get_tokens(client, ALICE)
    bob, _ = get_tokens(client, BOB)
    a, b = alice["access_token"], bob["access_token"]
    for t in (a, b):
        init_session(client, t)
    tool(client, a, "add_words", {"words": [
        {"word": "apple", "translation": "яблуко"}, {"word": "pear", "translation": "груша"}]})
    tool(client, b, "add_words", {"words": [{"word": "apple", "translation": "інше"}]})

    assert "Total: 2" in tool(client, a, "get_stats", {})
    assert "Total: 1" in tool(client, b, "get_stats", {})
    assert "pear" not in tool(client, b, "list_words", {})
    assert "інше" in tool(client, b, "list_words", {})
    assert "No matching" in tool(client, b, "list_words", {"search": "груша"})

    # Bob cannot touch Alice's words by id or by spelling
    alice_pear = client.get("/api/vocabulary?q=pear", headers=bearer(ALICE)).json()["words"][0]["id"]
    assert f"No word with id {alice_pear}" in tool(client, b, "delete_word", {"id": alice_pear})
    assert "not found" in tool(client, b, "update_word", {"word": "pear", "notes": "x"})
    assert f"No word with id {alice_pear}" in tool(client, b, "update_word", {"id": alice_pear, "notes": "x"})
    assert "Total: 2" in tool(client, a, "get_stats", {})

    # the connector writes to the same dictionary the PWA shows
    assert client.get("/api/vocabulary", headers=bearer(ALICE)).json()["total"] == 2
    assert client.get("/api/vocabulary", headers=bearer(BOB)).json()["total"] == 1


def test_refresh_keeps_the_owner(client):
    bob, info = get_tokens(client, BOB)
    rt = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": bob["refresh_token"],
                                     "client_id": info["client_id"], "client_secret": info["client_secret"]}).json()
    tool(client, rt["access_token"], "add_words", {"words": [{"word": "plum", "translation": "слива"}]})
    assert client.get("/api/vocabulary", headers=bearer(BOB)).json()["total"] == 1
    assert client.get("/api/vocabulary", headers=bearer(ALICE)).json()["total"] == 0


def test_tokens_from_before_accounts_are_rejected(client):
    """Old access tokens have no owner; they must not fall back to anyone's dictionary."""
    import jwt

    from app import config

    now = int(time.time())
    legacy = jwt.encode({"sub": "some-client", "jti": "j1", "scopes": [], "iat": now, "exp": now + 600,
                         "iss": config.ISSUER_URL}, config.MCP_SECRET, algorithm="HS256")
    r = client.post("/mcp", headers={**MCP_HEADERS, "Authorization": f"Bearer {legacy}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert r.status_code == 401


def test_legacy_refresh_token_without_owner_is_refused(client):
    from app import oauth_store

    _, info = get_tokens(client)
    oauth_store.save_refresh_token("legacy-rt", info["client_id"], "[]", int(time.time()) + 600, None)
    r = client.post("/token", data={"grant_type": "refresh_token", "refresh_token": "legacy-rt",
                                    "client_id": info["client_id"], "client_secret": info["client_secret"]})
    assert r.status_code == 400


def test_add_words_auto_translation_and_topics(client, as_alice, monkeypatch):
    import asyncio

    from app import mcp_tools, translator
    from app.translator import PosMeanings, Translation, TranslationUnavailable

    def fake_translate(text, existing_topics):
        if text == "borsch":
            return Translation(is_english=False, lemma=text, parts=[], main="", topic="")
        if text == "down":
            raise TranslationUnavailable("down")
        return Translation(is_english=True, lemma=text, parts=[PosMeanings(pos="дієслово", meanings=["бігти"])],
                           main="бігти", topic="Рух")

    def fake_topic(word, translation, existing):
        if word == "fail":
            raise TranslationUnavailable("down")
        return "Їжа"

    monkeypatch.setattr(translator, "translate", fake_translate)
    monkeypatch.setattr(translator, "suggest_topic", fake_topic)

    out = asyncio.run(mcp_tools.add_words([
        {"word": "run"}, {"word": "run"}, {"word": "borsch"}, {"word": "down"},
        {"word": "apple", "translation": "яблуко"},
        {"word": "pear", "translation": "груша", "section": "Fruit"},
    ]))
    assert "Saved 3" in out and "run" in out
    assert "already" in out.lower() and "not English: borsch" in out and "unavailable: down" in out
    from app import vocab
    assert vocab.find_by_word(ALICE["id"], "run")["section"] == "Рух"
    assert vocab.find_by_word(ALICE["id"], "apple")["section"] == "Їжа"
    assert vocab.find_by_word(ALICE["id"], "pear")["section"] == "Fruit"


def test_add_words_stops_calling_claude_after_first_failure(client, as_alice, monkeypatch):
    import asyncio

    from app import mcp_tools, translator, vocab
    from app.translator import TranslationUnavailable

    calls = []

    def fake_topic(word, translation, existing):
        calls.append(word)
        raise TranslationUnavailable("down")

    def fake_translate(text, existing):
        calls.append(text)
        raise TranslationUnavailable("down")

    monkeypatch.setattr(translator, "suggest_topic", fake_topic)
    monkeypatch.setattr(translator, "translate", fake_translate)
    out = asyncio.run(mcp_tools.add_words([
        {"word": "a1", "translation": "x"}, {"word": "a2", "translation": "y"},
        {"word": "a3", "translation": "z"}, {"word": "u1"}, {"word": "u2"},
    ]))
    assert calls == ["a1"]
    assert vocab.find_by_word(ALICE["id"], "a2")["section"] == "Без теми"
    assert vocab.find_by_word(ALICE["id"], "a3")["section"] == "Без теми"
    assert "unavailable: u1, u2" in out and vocab.find_by_word(ALICE["id"], "u1") is None


def test_add_words_breaker_trips_on_quick_add_failure(client, as_alice, monkeypatch):
    import asyncio

    from app import mcp_tools, translator
    from app.translator import TranslationUnavailable

    calls = []

    def fake_translate(text, existing):
        calls.append(text)
        raise TranslationUnavailable("down")

    monkeypatch.setattr(translator, "translate", fake_translate)
    out = asyncio.run(mcp_tools.add_words([{"word": "u1"}, {"word": "u2"}, {"word": "u3"}]))
    assert calls == ["u1"] and "unavailable: u1, u2, u3" in out
