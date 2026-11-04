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
    assert s == [{"name": "S1", "words": 2, "due": 2, "due_reverse": 2}]
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
