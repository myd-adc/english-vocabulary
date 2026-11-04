"""Per-user scoping of every vocabulary endpoint, and the owner claim of pre-account words."""

from conftest import ALICE, BOB, OWNER, bearer

from app import vocab
from app.db import connection

WORD = {"word": "Apple", "translation": "яблуко", "section": "Food"}


def add(client, headers, body=None):
    r = client.post("/api/vocabulary", json=body or WORD, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_each_user_can_save_the_same_word(client, headers, bob_headers):
    a = add(client, headers)
    b = add(client, bob_headers)
    assert a["id"] != b["id"]
    assert client.post("/api/vocabulary", json=WORD, headers=headers).status_code == 409
    assert client.post("/api/vocabulary", json=WORD, headers=bob_headers).status_code == 409


def test_lists_are_private(client, headers, bob_headers):
    add(client, headers)
    add(client, headers, {"word": "pear", "translation": "груша"})
    add(client, bob_headers, {"word": "plum", "translation": "слива"})
    assert client.get("/api/vocabulary", headers=headers).json()["total"] == 2
    bobs = client.get("/api/vocabulary", headers=bob_headers).json()
    assert [w["word"] for w in bobs["words"]] == ["plum"]
    assert client.get("/api/vocabulary?q=apple", headers=bob_headers).json()["total"] == 0
    assert client.get("/api/vocabulary?section=Food", headers=bob_headers).json()["total"] == 0
    assert len(client.get("/api/vocabulary/due?direction=forward", headers=bob_headers).json()) == 1


def test_other_users_word_is_404_for_every_write(client, headers, bob_headers):
    wid = add(client, headers)["id"]
    assert client.patch(f"/api/vocabulary/{wid}", json={"notes": "x"}, headers=bob_headers).status_code == 404
    assert client.patch(f"/api/vocabulary/{wid}/review", json={"quality": 4}, headers=bob_headers).status_code == 404
    assert client.delete(f"/api/vocabulary/{wid}", headers=bob_headers).status_code == 404
    mine = client.get("/api/vocabulary", headers=headers).json()["words"][0]
    assert mine["notes"] is None and mine["repetitions"] == 0


def test_review_progress_is_per_user(client, headers, bob_headers):
    a = add(client, headers)["id"]
    b = add(client, bob_headers)["id"]
    client.patch(f"/api/vocabulary/{a}/review", json={"quality": 5}, headers=headers)
    assert client.get("/api/stats", headers=headers).json()["due_today"] == 0
    assert client.get("/api/stats", headers=bob_headers).json()["due_today"] == 1
    client.patch(f"/api/vocabulary/{b}/review", json={"quality": 5}, headers=bob_headers)
    assert client.get("/api/stats", headers=bob_headers).json()["due_today"] == 0


def test_sections_and_stats_are_private(client, headers, bob_headers):
    add(client, headers)
    add(client, bob_headers, {"word": "plum", "translation": "слива", "section": "Fruit"})
    assert [s["name"] for s in client.get("/api/sections", headers=headers).json()] == ["Food"]
    assert [s["name"] for s in client.get("/api/sections", headers=bob_headers).json()] == ["Fruit"]
    assert client.get("/api/stats", headers=headers).json()["total"] == 1


def test_rename_topic_is_scoped(client, headers, bob_headers):
    add(client, headers)
    add(client, bob_headers)
    assert client.patch("/api/topics/Food", json={"name": "Їжа"}, headers=headers).json() == {"updated": 1}
    assert [s["name"] for s in client.get("/api/sections", headers=bob_headers).json()] == ["Food"]
    assert client.patch("/api/topics/Їжа", json={"name": "X"}, headers=bob_headers).status_code == 404


def test_backfill_only_touches_own_words(client, headers, bob_headers, monkeypatch):
    from app import translator

    monkeypatch.setattr(translator, "suggest_topic", lambda w, t, ex: "Їжа")
    add(client, headers, {"word": "a", "translation": "а"})
    add(client, bob_headers, {"word": "b", "translation": "б"})
    assert client.post("/api/topics/backfill", headers=headers).json() == {"updated": 1, "remaining": 0}
    assert vocab.find_by_word(BOB["id"], "b")["section"] is None
    assert client.post("/api/topics/backfill", headers=bob_headers).json() == {"updated": 1, "remaining": 0}


def test_quick_add_duplicate_check_is_per_user(client, headers, bob_headers, monkeypatch):
    from app import translator
    from app.translator import PosMeanings, Translation

    seen = []

    def fake(text, existing_topics):
        seen.append(existing_topics)
        return Translation(is_english=True, lemma=text, parts=[PosMeanings(pos="дієслово", meanings=["бігти"])],
                           main="бігти", topic="Рух")

    monkeypatch.setattr(translator, "translate", fake)
    assert client.post("/api/vocabulary/quick", json={"text": "run"}, headers=headers).json()["status"] == "created"
    assert client.post("/api/vocabulary/quick", json={"text": "run"}, headers=bob_headers).json()["status"] == "created"
    assert client.post("/api/vocabulary/quick", json={"text": "run"}, headers=bob_headers).json()["status"] == "exists"
    assert seen == [[], []]  # Bob's topic list did not include Alice's topics


def test_update_rename_clash_only_within_one_user(client, headers, bob_headers):
    add(client, headers)
    bid = add(client, bob_headers, {"word": "pear", "translation": "груша"})["id"]
    # "apple" exists for Alice only, so Bob may rename to it
    assert client.patch(f"/api/vocabulary/{bid}", json={"word": "apple"}, headers=bob_headers).status_code == 200


def test_vocab_functions_take_the_user(client):
    vocab.add_word(ALICE["id"], {"word": "a", "translation": "а"})
    assert vocab.find_by_word(BOB["id"], "a") is None
    assert vocab.find_by_word(ALICE["id"], "A")["word"] == "a"
    assert vocab.topic_names(BOB["id"]) == []


# ── owner claim ───────────────────────────────────────────────────────────────


def orphan(word, translation="т"):
    with connection() as conn:
        conn.execute("INSERT INTO words (word, translation, user_id) VALUES (%s, %s, NULL)", [word, translation])


def owner_ids():
    with connection() as conn:
        return [r["user_id"] and str(r["user_id"]) for r in
                conn.execute("SELECT user_id FROM words ORDER BY id").fetchall()]


def test_owner_claims_unowned_words_on_first_request(client):
    orphan("old1")
    orphan("old2")
    r = client.get("/api/vocabulary", headers=bearer(OWNER))
    assert r.json()["total"] == 2
    assert owner_ids() == [OWNER["id"], OWNER["id"]]


def test_other_users_do_not_claim_unowned_words(client, headers):
    orphan("old1")
    assert client.get("/api/vocabulary", headers=headers).json()["total"] == 0
    assert owner_ids() == [None]
    assert client.get("/api/vocabulary", headers=bearer(OWNER)).json()["total"] == 1


def test_owner_claim_never_takes_other_users_words(client, headers):
    add(client, headers)
    orphan("old1")
    client.get("/api/vocabulary", headers=bearer(OWNER))
    assert client.get("/api/vocabulary", headers=headers).json()["total"] == 1
    assert client.get("/api/vocabulary", headers=bearer(OWNER)).json()["total"] == 1


def test_owner_claim_skips_words_the_owner_already_has(client):
    with connection() as conn:  # the owner saved "apple" through MCP before first opening the app
        conn.execute("INSERT INTO words (word, translation, user_id) VALUES ('apple', 'нове', %s)", [OWNER["id"]])
    orphan("Apple")
    orphan("fig")
    r = client.get("/api/vocabulary", headers=bearer(OWNER))
    assert r.status_code == 200
    assert sorted(w["word"] for w in r.json()["words"]) == ["apple", "fig"]
