from datetime import date, timedelta

import pytest
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.testclient import TestClient

from app.main import WEB_DIST, SPAStaticFiles
from conftest import ALICE

U = ALICE["id"]

WORD = {"word": "Apple", "translation": "яблуко", "transcription": "/ˈæp.əl/", "section": "Food"}
HTML = {"accept": "text/html,application/xhtml+xml"}


@pytest.fixture()
def spa(tmp_path):
    """The static file server on a tiny fake build, so tests never need Node or web/dist."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>LexiVocab</title>", encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "sw.js").write_text("self.skipWaiting()", encoding="utf-8")
    (tmp_path / "manifest.webmanifest").write_text('{"short_name": "LexiVocab"}', encoding="utf-8")
    app = Starlette(routes=[Mount("/", app=SPAStaticFiles(directory=tmp_path, html=True))])
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_spa_serves_index_at_root(spa):
    r = spa.get("/")
    assert r.status_code == 200 and "LexiVocab" in r.text


def test_spa_shell_must_revalidate_but_hashed_assets_are_immutable(spa):
    for path in ("/", "/index.html", "/sw.js", "/manifest.webmanifest"):
        assert spa.get(path).headers["cache-control"] == "no-cache", path
    cc = spa.get("/assets/index-abc123.js").headers["cache-control"]
    assert cc == "public, max-age=31536000, immutable"


def test_spa_fallback_serves_index_for_client_routes(spa):
    for path in ("/topic/Їжа", "/topic", "/review", "/study"):
        r = spa.get(path, headers=HTML)
        assert r.status_code == 200 and "LexiVocab" in r.text, path
        assert r.headers["cache-control"] == "no-cache"


def test_spa_fallback_does_not_hide_missing_files(spa):
    assert spa.get("/assets/old-hash.js", headers=HTML).status_code == 404
    assert spa.get("/nothing.png").status_code == 404  # not a page navigation


def test_api_paths_are_not_shadowed_by_the_spa(client):
    assert client.get("/api/vocabulary", headers=HTML).status_code == 401
    r = client.get("/api/does-not-exist", headers=HTML)
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")


@pytest.mark.skipif(not (WEB_DIST / "index.html").exists(), reason="web/dist not built (npm --prefix web run build)")
def test_real_build_is_served(client):
    assert "LexiVocab" in client.get("/").text
    assert client.get("/manifest.webmanifest").json()["short_name"] == "LexiVocab"
    assert client.get("/apple-touch-icon.png").status_code == 200
    assert "LexiVocab" in client.get("/topic/Їжа", headers=HTML).text


def test_auth_required(client, headers):
    assert client.get("/api/vocabulary").status_code == 401
    assert client.get("/api/vocabulary", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.get("/api/vocabulary", headers=headers).status_code == 200


def test_crud(client, headers):
    r = client.post("/api/vocabulary", json=WORD, headers=headers)
    assert r.status_code == 201
    wid = r.json()["id"]
    assert r.json()["next_review"] == r.json()["reverse_next_review"]
    assert client.post("/api/vocabulary", json={**WORD, "word": "APPLE"}, headers=headers).status_code == 409
    assert client.post("/api/vocabulary", json={"word": " ", "translation": "x"}, headers=headers).status_code == 422
    r = client.patch(f"/api/vocabulary/{wid}", json={"notes": "fruit", "section": None}, headers=headers)
    assert r.json()["notes"] == "fruit" and r.json()["section"] is None
    assert r.json()["translation"] == "яблуко"  # untouched
    assert client.get("/api/vocabulary?q=ябл", headers=headers).json()["total"] == 1
    assert client.delete(f"/api/vocabulary/{wid}", headers=headers).status_code == 204
    assert client.delete(f"/api/vocabulary/{wid}", headers=headers).status_code == 404


def test_update_duplicate_conflict(client, headers):
    client.post("/api/vocabulary", json=WORD, headers=headers)
    b = client.post("/api/vocabulary", json={"word": "pear", "translation": "груша"}, headers=headers).json()
    assert client.patch(f"/api/vocabulary/{b['id']}", json={"word": "apple"}, headers=headers).status_code == 409


def test_bulk_skips_duplicates_case_insensitive(client, headers):
    client.post("/api/vocabulary", json=WORD, headers=headers)
    body = {"words": [WORD | {"word": "apple"}, {"word": "pear", "translation": "груша"},
                      {"word": "PEAR", "translation": "груша"}]}
    r = client.post("/api/vocabulary/bulk", json=body, headers=headers).json()
    assert [w["word"] for w in r["inserted"]] == ["pear"]
    assert r["skipped_count"] == 2
    assert client.post("/api/vocabulary/bulk", json={"words": []}, headers=headers).status_code == 422
    too_many = {"words": [{"word": f"w{i}", "translation": "x"} for i in range(51)]}
    assert client.post("/api/vocabulary/bulk", json=too_many, headers=headers).status_code == 422


def test_review_directions_are_independent(client, headers):
    wid = client.post("/api/vocabulary", json=WORD, headers=headers).json()["id"]
    r = client.patch(f"/api/vocabulary/{wid}/review?direction=forward", json={"quality": 4}, headers=headers).json()
    assert r["repetitions"] == 1 and r["reverse_repetitions"] == 0
    assert r["next_review"] > r["reverse_next_review"]
    due_fwd = client.get("/api/vocabulary/due?direction=forward", headers=headers).json()
    due_rev = client.get("/api/vocabulary/due?direction=reverse", headers=headers).json()
    assert due_fwd == [] and len(due_rev) == 1
    r = client.patch(f"/api/vocabulary/{wid}/review?direction=reverse", json={"quality": 0}, headers=headers).json()
    assert r["reverse_lapses"] == 1 and r["lapses"] == 0
    assert r["reverse_ease_factor"] < 2.5
    assert client.patch("/api/vocabulary/999/review", json={"quality": 3}, headers=headers).status_code == 404
    assert client.patch(f"/api/vocabulary/{wid}/review", json={"quality": 9}, headers=headers).status_code == 422


def test_sections_stats_difficult(client, headers):
    for w in ("a", "b", "c"):
        client.post("/api/vocabulary", json={"word": w, "translation": w, "section": "S1" if w != "c" else None}, headers=headers)
    s = client.get("/api/sections", headers=headers).json()
    assert {x["name"]: x["words"] for x in s} == {"S1": 2, "Без теми": 1}
    for _ in range(2):
        client.patch("/api/vocabulary/1/review", json={"quality": 0}, headers=headers)
    stats = client.get("/api/stats", headers=headers).json()
    assert stats["total"] == 3 and stats["difficult"] == 1 and stats["sections"] == 2  # S1 + Без теми
    assert stats["due_today"] == 2  # word 1 was pushed to tomorrow
    hard = client.get("/api/vocabulary?difficult=true", headers=headers).json()
    assert [w["word"] for w in hard["words"]] == ["a"]
    assert client.get("/api/vocabulary?section=S1&due=forward", headers=headers).json()["total"] == 1


def test_next_review_is_in_future_after_pass(client, headers):
    wid = client.post("/api/vocabulary", json=WORD, headers=headers).json()["id"]
    client.patch(f"/api/vocabulary/{wid}/review", json={"quality": 4}, headers=headers)
    r = client.patch(f"/api/vocabulary/{wid}/review", json={"quality": 4}, headers=headers).json()
    assert r["interval"] == 6
    assert date.fromisoformat(r["next_review"]) - date.today() <= timedelta(days=7)


def _fake_translate(monkeypatch, topic="Рух"):
    from app import translator
    from app.translator import PosMeanings, Translation

    def fake(text, existing_topics):
        return Translation(is_english=True, lemma=text, parts=[PosMeanings(pos="дієслово", meanings=["бігти"])],
                           main="бігти", topic=topic)

    monkeypatch.setattr(translator, "translate", fake)


def test_quick_endpoint_statuses(client, headers, monkeypatch):
    _fake_translate(monkeypatch)
    r = client.post("/api/vocabulary/quick", json={"text": "run"}, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "created"
    assert r.json()["word"]["section"] == "Рух"
    r = client.post("/api/vocabulary/quick", json={"text": "run"}, headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "exists"
    assert client.post("/api/vocabulary/quick", json={"text": "  "}, headers=headers).status_code == 422


def test_quick_endpoint_requires_auth(client):
    assert client.post("/api/vocabulary/quick", json={"text": "run"}).status_code == 401


def test_rename_topic_endpoint(client, headers):
    client.post("/api/vocabulary", json={"word": "a", "translation": "а", "section": "Old"}, headers=headers)
    r = client.patch("/api/topics/Old", json={"name": "New"}, headers=headers)
    assert r.status_code == 200 and r.json() == {"updated": 1}
    assert client.patch("/api/topics/Nope", json={"name": "X"}, headers=headers).status_code == 404
    assert [s["name"] for s in client.get("/api/sections", headers=headers).json()] == ["New"]


def test_rename_untopiced_tile(client, headers):
    client.post("/api/vocabulary", json={"word": "a", "translation": "а"}, headers=headers)
    r = client.patch("/api/topics/Без теми", json={"name": "Різне"}, headers=headers)
    assert r.json() == {"updated": 1}


def test_backfill_endpoint(client, headers, monkeypatch):
    from app import translator
    monkeypatch.setattr(translator, "suggest_topic", lambda w, t, ex: "Їжа")
    client.post("/api/vocabulary", json={"word": "a", "translation": "а"}, headers=headers)
    r = client.post("/api/topics/backfill", headers=headers)
    assert r.status_code == 200 and r.json() == {"updated": 1, "remaining": 0}


def test_due_multiple_sections(client, headers):
    for w, sec in (("a", "A"), ("b", "B"), ("c", "C")):
        client.post("/api/vocabulary", json={"word": w, "translation": w, "section": sec}, headers=headers)
    due = client.get("/api/vocabulary/due?section=A&section=B", headers=headers).json()
    assert sorted(w["word"] for w in due) == ["a", "b"]
    lst = client.get("/api/vocabulary?section=A&section=B", headers=headers).json()
    assert lst["total"] == 2
    assert client.get("/api/vocabulary?section=C", headers=headers).json()["total"] == 1


def test_sections_include_untopiced(client, headers):
    client.post("/api/vocabulary", json={"word": "a", "translation": "а"}, headers=headers)
    client.post("/api/vocabulary", json={"word": "b", "translation": "б", "section": "Без теми"}, headers=headers)
    s = client.get("/api/sections", headers=headers).json()
    assert s == [{"name": "Без теми", "words": 2, "due": 2, "due_reverse": 2}]
    got = client.get("/api/vocabulary?section=Без теми", headers=headers).json()
    assert got["total"] == 2
    assert client.get("/api/vocabulary/due?section=Без теми", headers=headers).json().__len__() == 2


def test_backfill_endpoint_caps_batch(client, headers, monkeypatch):
    from app import translator
    monkeypatch.setattr(translator, "suggest_topic", lambda w, t, ex: "Їжа")
    for i in range(15):
        client.post("/api/vocabulary", json={"word": f"w{i}", "translation": "т"}, headers=headers)
    r = client.post("/api/topics/backfill", headers=headers)
    assert r.json() == {"updated": 10, "remaining": 5}
    r = client.post("/api/topics/backfill", headers=headers)
    assert r.json() == {"updated": 5, "remaining": 0}


def test_update_translation_clears_stale_main_translation(client, headers):
    from app import vocab

    wid = client.post("/api/vocabulary", json={"word": "run", "translation": "бігти", "main_translation": "бігти"},
                      headers=headers).json()["id"]
    assert vocab.update_word(U, wid, {"notes": "n"})["main_translation"] == "бігти"
    assert vocab.update_word(U, wid, {"translation": "керувати"})["main_translation"] is None
    row = vocab.update_word(U, wid, {"translation": "іти", "main_translation": "іти"})
    assert row["main_translation"] == "іти"


def test_topic_names_excludes_fallback(client, headers):
    from app import vocab

    client.post("/api/vocabulary", json={"word": "a", "translation": "a", "section": "Рух"}, headers=headers)
    client.post("/api/vocabulary", json={"word": "b", "translation": "b", "section": "Без теми"}, headers=headers)
    client.post("/api/vocabulary", json={"word": "c", "translation": "c"}, headers=headers)
    assert vocab.topic_names(U) == ["Рух"]


def test_tables_have_row_level_security(client):
    from app.db import connection

    with connection() as conn:
        rows = conn.execute(
            "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(%s)",
            [["words", "oauth_clients", "oauth_auth_codes", "oauth_refresh_tokens", "oauth_revoked_tokens"]],
        ).fetchall()
    assert len(rows) == 5 and all(r["relrowsecurity"] for r in rows)
