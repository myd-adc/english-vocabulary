from datetime import date, timedelta

WORD = {"word": "Apple", "translation": "яблуко", "transcription": "/ˈæp.əl/", "section": "Food"}


def test_health_and_static(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert "LexiVocab" in client.get("/").text
    assert client.get("/manifest.json").json()["short_name"] == "LexiVocab"
    assert client.get("/apple-touch-icon.png").status_code == 200


def test_auth_required_and_login(client, headers):
    assert client.get("/api/vocabulary").status_code == 401
    assert client.get("/api/vocabulary", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    assert client.get("/api/vocabulary", headers=headers).status_code == 200


def test_login_throttle(client):
    for _ in range(10):
        client.post("/api/auth/login", json={"password": "bad"})
    assert client.post("/api/auth/login", json={"password": "test-password"}).status_code == 429


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
    assert stats["total"] == 3 and stats["difficult"] == 1 and stats["sections"] == 1
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
    for i in range(25):
        client.post("/api/vocabulary", json={"word": f"w{i}", "translation": "т"}, headers=headers)
    r = client.post("/api/topics/backfill", headers=headers)
    assert r.json() == {"updated": 20, "remaining": 5}
    r = client.post("/api/topics/backfill", headers=headers)
    assert r.json() == {"updated": 5, "remaining": 0}
