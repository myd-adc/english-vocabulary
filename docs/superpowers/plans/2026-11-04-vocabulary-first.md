# Vocabulary-first LexiVocab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing an English word in the PWA (or sending it through MCP) translates it automatically with Claude, normalises it, files it under a topic and saves it. The home screen becomes a dictionary of topic tiles, and review moves to a secondary screen.

**Architecture:** A new module `app/translator.py` wraps one structured-output call to Claude Haiku 5.5. `app/vocab.py` gains `quick_add` (duplicate check → translate → second duplicate check → insert) and topic helpers. REST (`app/api.py`) and MCP (`app/mcp_tools.py`) call these. The PWA (vanilla JS) gets a new home screen (input + result card + topic tiles), a topic page, and a review picker that takes several topics.

**Tech Stack:** FastAPI, psycopg 3 / Postgres, `anthropic` Python SDK 1.x (`client.messages.parse` with a Pydantic `output_format`), vanilla JS PWA, pytest.

**Spec:** `docs/superpowers/specs/2026-11-04-vocabulary-first-design.md`

## Global Constraints

- Model id is exactly `claude-haiku-5-5`, set with `output_config={"effort": "low"}`. Do not send `thinking` or `temperature`.
- `ANTHROPIC_API_KEY` is optional. Without it the app starts normally and `translator.enabled()` returns `False`.
- Claude call timeout is 15 s with `max_retries=1`. Any Anthropic error results in `TranslationUnavailable`, never a 500.
- Topics are stored in the existing `words.section` column. The UI label is «Тема». The fallback topic is exactly `Без теми`, and the topic for general words is exactly `Загальне`.
- Topic names are Ukrainian, 1–3 words, first letter capitalised. They match existing topics case-insensitively, so an existing name is reused with its existing spelling.
- A translation has at most 3 parts of speech and at most 5 meanings per part of speech.
- The `words.translation` NOT NULL constraint stays. A word is never saved without a translation.
- All UI copy is Ukrainian, short and plain: no emoji, no exclamation marks, no marketing tone.
- Commits use Conventional Commits, a subject line only, no body, and no trailers (`CLAUDE.md`).
- Subagents run on `model: "sonnet"`. The memory note on cheaper development models applies.

## Review Focus

1. Input with surrounding spaces or capitals (`"  Run "`) is matched against existing `run` before Claude is called. It must not create a second entry or spend an API call. *(Task 2 test `test_quick_add_existing_skips_claude`)*
2. Ukrainian or other non-English text typed by mistake (`"бігти"`) saves nothing and returns `not_english`. *(Task 2 test `test_quick_add_not_english`)*
3. A Claude timeout or error leaves the input in the field and offers manual entry. The API returns `unavailable`, never a 500. *(Task 2 test `test_quick_add_unavailable`, Task 4 manual check)*
4. Claude returns a topic that differs from an existing one only by case (`"робота"` when `Робота` exists). The word must go into `Робота`, and no new tile may appear. *(Task 1 test `test_topic_matches_existing_case_insensitive`)*
5. A multi-word phrase (`"give up"`) is kept as typed and not reduced to `give`. *(Task 1 prompt rule, Task 2 test `test_quick_add_phrase_kept`)*

---

### Task 1: Translator module

**Files:**
- Create: `app/translator.py`
- Modify: `app/config.py` (add `ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()`), `requirements.txt` (add `anthropic>=1,<2`), `.env.example` (document `ANTHROPIC_API_KEY`)
- Test: `tests/test_translator.py`

**Interfaces:**
- Produces:
  - `class PosMeanings(BaseModel): pos: str; meanings: list[str]`. `pos` is a Ukrainian part-of-speech name such as `"дієслово"`.
  - `class Translation(BaseModel): is_english: bool; lemma: str; parts: list[PosMeanings]; main: str; topic: str`
  - `class TranslationUnavailable(Exception)`
  - `def enabled() -> bool`
  - `def translate(text: str, existing_topics: list[str]) -> Translation`. It raises `TranslationUnavailable`, and it truncates `parts` to 3 and `meanings` to 5. If `topic` case-insensitively equals an existing topic, the existing spelling is used.
  - `def format_parts(parts: list[PosMeanings]) -> str`. It returns lines `"<pos>: m1, m2"` joined with `"\n"`.
  - `def suggest_topic(word: str, translation: str, existing_topics: list[str]) -> str`. It is used for backfilling words that have no topic, and it raises `TranslationUnavailable`.
  - Module-level `_client()`, which returns `anthropic.Anthropic(timeout=15.0, max_retries=1)`. Tests monkeypatch it.

- [ ] **Step 1: Write the failing tests** using a fake client object whose `.messages.parse(**kw)` returns `SimpleNamespace(parsed_output=Translation(...), stop_reason="end_turn")`:

```python
def test_format_parts():
    parts = [PosMeanings(pos="дієслово", meanings=["бігти", "керувати"]),
             PosMeanings(pos="іменник", meanings=["біг"])]
    assert format_parts(parts) == "дієслово: бігти, керувати\nіменник: біг"

def test_translate_truncates(monkeypatch):  # 4 parts × 7 meanings -> 3 × 5
    ...
    assert len(t.parts) == 3 and all(len(p.meanings) <= 5 for p in t.parts)

def test_topic_matches_existing_case_insensitive(monkeypatch):  # model says "робота"
    t = translate("hire", ["Робота", "Їжа"])
    assert t.topic == "Робота"

def test_translate_passes_model_and_topics(monkeypatch):  # inspect captured kwargs
    assert kw["model"] == "claude-haiku-5-5" and "Робота" in str(kw["messages"])

def test_api_error_becomes_unavailable(monkeypatch):  # fake raises anthropic.APIConnectionError
    with pytest.raises(TranslationUnavailable): translate("run", [])

def test_refusal_becomes_unavailable(monkeypatch):  # stop_reason="refusal", parsed_output=None
    with pytest.raises(TranslationUnavailable): translate("run", [])

def test_disabled_without_key(monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    assert enabled() is False
    with pytest.raises(TranslationUnavailable): translate("run", [])
```

- [ ] **Step 2: Run** `pytest tests/test_translator.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `app/translator.py`.** `translate` calls `_client().messages.parse(model="claude-haiku-5-5", max_tokens=1024, output_config={"effort": "low"}, system=SYSTEM, messages=[...], output_format=Translation)`. It catches `anthropic.APIError` (the base class for connection, timeout and status errors) and treats `parsed_output is None` as unavailable. `SYSTEM` (English, stable, so it can be cached) must say:
  - translate English → Ukrainian like a good bilingual dictionary, with common meanings only, grouped by part of speech (Ukrainian names), most common first, at most 3 parts and at most 5 meanings each;
  - `lemma`: fix typos and give the dictionary base form (`ran`→`run`, `children`→`child`, `runing`→`run`), but keep phrasal verbs and fixed expressions as typed, lowercase except proper nouns;
  - `main`: the 1–2 most common Ukrainian words;
  - `is_english=false` if the input is not English (for example Ukrainian), in which case the other fields may be empty;
  - `topic`: pick from the provided list when one fits; otherwise create a broad Ukrainian topic of 1–3 words (aim for roughly 10–20 topics in total); use `Загальне` for general words such as "however" or "available".

  The existing topics go into the user message, never into `SYSTEM`. `suggest_topic` uses the same client with a small `class TopicOnly(BaseModel): topic: str` and the same topic rules.
- [ ] **Step 4: Run** `pytest tests/test_translator.py -v`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add claude translator for words and topics`

### Task 2: Storage and quick add

**Files:**
- Modify: `app/db.py` (schema), `app/vocab.py`, `app/models.py`
- Test: `tests/test_quick_add.py`

**Interfaces:**
- Consumes: Task 1 `translate`, `format_parts`, `TranslationUnavailable`, `suggest_topic`, `enabled`.
- Produces:
  - DB: `ALTER TABLE words ADD COLUMN IF NOT EXISTS main_translation TEXT`, run in `init_db` after `SCHEMA`. `main_translation` is added to `CONTENT_FIELDS` (optional) and to `WordCreate`, `WordUpdate` and `WordResponse` (`str | None = None`).
  - `vocab.FALLBACK_TOPIC = "Без теми"`
  - `vocab.topic_names() -> list[str]`: distinct non-null `section` values.
  - `vocab.quick_add(text: str) -> dict`. It returns `{"status": "created"|"exists"|"not_english"|"unavailable", "input": str, "word": dict | None}`. Flow: strip the text and raise `ValidationError` if it is empty → `find_by_word(text)` returns `exists` if found → `translate(text, topic_names())`, where `TranslationUnavailable` returns `unavailable` → `not is_english` returns `not_english` → `find_by_word(lemma)` returns `exists` if found → `add_word({word: lemma, translation: format_parts(parts), main_translation: main, section: topic})` returns `created`.
  - `vocab.rename_topic(old: str, new: str) -> int`: updates `section` and returns the number of rows changed. Renaming to an existing name merges the topics, which needs no special code. It raises `ValidationError` if `new` is blank.
  - `vocab.backfill_topics(limit: int = 200) -> dict`: for words with `section IS NULL`, calls `suggest_topic` one word at a time and sets `section`. It returns `{"updated": int, "remaining": int}` and stops at the first `TranslationUnavailable`.
  - `vocab.list_words(...)` and `vocab.get_due(...)` accept `sections: list[str] | None` in addition to `section`, filtered with `section = ANY(%s)`.
  - `models.QuickAddRequest(text: str)` and `models.QuickAddResponse(status: str, input: str, word: WordResponse | None = None)`.

- [ ] **Step 1: Write the failing tests** (DB-backed, using the existing `client` and `clean_db` fixtures, with `app.translator.translate` monkeypatched to a fake that records its calls):

```python
def test_quick_add_creates_with_topic(fake_translate):  # fake: lemma run, topic "Рух і спорт"
    r = vocab.quick_add("run")
    assert r["status"] == "created" and r["word"]["section"] == "Рух і спорт"
    assert r["word"]["main_translation"] == "бігти"
    assert r["word"]["translation"].startswith("дієслово: бігти")

def test_quick_add_existing_skips_claude(fake_translate):
    vocab.add_word({"word": "run", "translation": "бігти"})
    r = vocab.quick_add("  Run ")
    assert r["status"] == "exists" and fake_translate.calls == 0

def test_quick_add_normalized_duplicate(fake_translate):  # input "ran", lemma "run" exists
    assert vocab.quick_add("ran")["status"] == "exists"

def test_quick_add_not_english(fake_translate):  # fake returns is_english=False
    assert vocab.quick_add("бігти")["status"] == "not_english"
    assert vocab.list_words()["total"] == 0

def test_quick_add_unavailable(fake_translate):  # fake raises TranslationUnavailable
    assert vocab.quick_add("run")["status"] == "unavailable"

def test_quick_add_phrase_kept(fake_translate):  # fake echoes lemma "give up"
    assert vocab.quick_add("give up")["word"]["word"] == "give up"

def test_rename_topic_merges():
    vocab.add_word({"word": "a", "translation": "а", "section": "Їжа"})
    vocab.add_word({"word": "b", "translation": "б", "section": "Харчування"})
    assert vocab.rename_topic("Харчування", "Їжа") == 1
    assert vocab.topic_names() == ["Їжа"]

def test_list_words_multiple_sections(): ...  # sections=["A","B"] returns words of both, not C

def test_backfill_topics(monkeypatch): ...  # 2 unsectioned words -> {"updated": 2, "remaining": 0}
```

- [ ] **Step 2: Run** `pytest tests/test_quick_add.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema change, `main_translation` plumbing and the new `vocab` functions listed above.
- [ ] **Step 4: Run** `pytest -v`. Expected: all tests pass, old and new.
- [ ] **Step 5: Commit** `feat: add quick add with auto translation and topics`

### Task 3: REST and MCP endpoints

**Files:**
- Modify: `app/api.py`, `app/mcp_tools.py`, `app/models.py`
- Test: `tests/test_api.py` (add tests), `tests/test_mcp_oauth.py` (extend the existing flow test only if `add_words` output text changes)

**Interfaces:**
- Consumes: Task 2 `quick_add`, `rename_topic`, `backfill_topics`, `topic_names`, and `sections` filtering.
- Produces (REST, all under the protected router):
  - `POST /api/vocabulary/quick`, body `QuickAddRequest`. Returns 200 with `QuickAddResponse` for every status, or 422 for empty text.
  - `PATCH /api/topics/{name}`, body `{"name": str}`. Returns `{"updated": int}`, or 404 if the topic has 0 words.
  - `POST /api/topics/backfill`. Returns `{"updated": int, "remaining": int}`.
  - `GET /api/vocabulary` and `GET /api/vocabulary/due` accept a repeated `section` query parameter (`?section=A&section=B`). One value behaves exactly as today.
  - `GET /api/sections` is unchanged in shape, but words with a NULL section are now included as name `Без теми`.
- Produces (MCP):
  - In `add_words`, `WordInput.translation` becomes optional. For each item without a translation, call `vocab.quick_add(word)` and report created, existing, not-English and unavailable words separately in the reply. Items with a translation but no section get `translator.suggest_topic`, falling back to `Без теми` on `TranslationUnavailable`. Tool descriptions say "topic" instead of "section". Parameter names stay the same (`section_name`, `section`) so existing connectors keep working.

- [ ] **Step 1: Write the failing API tests**: `test_quick_endpoint_statuses` (monkeypatched translate → `created`, then the same word → `exists`), `test_quick_endpoint_requires_auth` (401), `test_rename_topic_endpoint` (200 `{"updated": 1}`; an unknown topic gives 404), `test_due_multiple_sections` (`?section=A&section=B`), `test_sections_include_untopiced` (a word without a section shows up as `Без теми`).
- [ ] **Step 2: Run** `pytest tests/test_api.py -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the endpoints and MCP changes.
- [ ] **Step 4: Run** `pytest -v`. Expected: all tests pass.
- [ ] **Step 5: Commit** `feat: expose quick add and topics via api and mcp`

### Task 4: PWA home: add word and topic tiles

**Files:**
- Modify: `pwa/index.html` (`#view-home`), `pwa/app.js` (home logic), `pwa/style.css`, `pwa/sw.js` (bump the cache version)

**Interfaces:**
- Consumes: `POST /api/vocabulary/quick`, `GET /api/sections`, `PATCH /api/vocabulary/{id}`, `DELETE /api/vocabulary/{id}`, and the existing edit sheet (`openEditSheet(word)`).
- Produces: `showView("topic", {name})` for Task 5 (the tile tap calls it), and a review button `#btn-review` that calls `showView("review")` (Task 5).

Layout (variant B, chosen by the owner, built on the existing visual style):
- Top bar: title `LexiVocab`, a small `Повторити` button and the existing menu.
- Input row: `<input type="text" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Англійське слово">` plus an add button. Enter submits. The button shows a busy state while waiting, and double submits are ignored.
- Result card, below the input, for each status:
  - `created`: the word, then the parts as lines (pos label muted, meanings regular), a topic chip, and `Збережено`. If `input` ≠ `word.word`, show `Ви ввели «ran» → збережено «run»`. Actions: `Змінити` (opens the edit sheet, including `main_translation` and `section` fields) and `Видалити`. The input clears.
  - `exists`: the same card with `Уже є у словнику`. The input clears.
  - `not_english`: `Це не схоже на англійське слово.` The input keeps its text.
  - `unavailable`: `Переклад зараз недоступний. Введіть переклад вручну.` plus a translation input and a `Зберегти` button. This posts to `POST /api/vocabulary` with `section: "Без теми"`. The word input keeps its text.
- Tiles: a 2-column grid from `/api/sections`. Each tile shows the name and `N слів` with correct Ukrainian plural forms (`1 слово`, `2 слова`, `5 слів`). The last tile is `Усі слова`. Tiles refresh after each add.
- Remove from home: the hero count, the metrics grid, and the settings block (direction and autoplay move to review in Task 5).

- [ ] **Step 1: Implement** the markup, logic and styles above, and add a `pluralWords(n)` helper.
- [ ] **Step 2: Verify in the running app.** With `ANTHROPIC_API_KEY` set locally, start `uvicorn app.main:app --env-file .env`, open it at a 390×844 viewport (Playwright), add `ran`, and expect the card `«ran» → «run»` and a new tile. Add `Run` and expect `Уже є у словнику`. Unset the key, restart, add `walk`, and expect the manual field; then save and expect a `Без теми` tile. Take screenshots of each state.
- [ ] **Step 3: Commit** `feat(pwa): dictionary home with auto translation and topic tiles`

### Task 5: PWA topic page and review picker

**Files:**
- Modify: `pwa/index.html` (repurpose `#view-browse` as the topic page, add `#view-review`), `pwa/app.js`, `pwa/quiz.js`, `pwa/style.css`

**Interfaces:**
- Consumes: `GET /api/vocabulary?section=…`, `PATCH /api/topics/{name}`, `GET /api/vocabulary/due?section=…&section=…`, and Task 4's `showView` hooks.
- Produces: none.

Behaviour:
- **Topic page:** a back button, the topic name, and `Перейменувати` (prompts for a new name, then calls `PATCH`; if the name already exists, the topics merge and the page reloads under the new name), plus `Повторити тему`, which opens review with only this topic selected. It shows a search field and the word list (word, then `main_translation ?? translation` first line). Tapping a word opens the existing edit sheet. `Усі слова` uses the same page with no section filter and no rename action.
- **Review screen:** a checklist of topics with counts (all checked by default), the existing `Вправа` toggle (cards / test) and `Напрямок` toggle, autoplay, and `Почати`. It starts the existing study flow with the selected sections, passed as repeated `section` params.
- **Cards and quiz:** quiz answer options, reverse card fronts and reverse quiz prompts use `main_translation || translation`. The card back for EN→UA shows the full `translation`, with line breaks preserved.

- [ ] **Step 1: Implement** the above, reusing the existing study and quiz code paths. Do not fork them.
- [ ] **Step 2: Verify in the running app** at 390×844. Open a topic and rename it to an existing topic: the topics merge. Start review with two topics and check that only their words appear. Quiz options are short main meanings, and the card back shows multi-line meanings.
- [ ] **Step 3: Commit** `feat(pwa): topic pages and multi-topic review`

### Task 6: Design pass, backfill trigger, docs

**Files:**
- Modify: `pwa/*` (fixes only), `pwa/app.js` (backfill trigger), `README.md`, `render.yaml` (add `ANTHROPIC_API_KEY` with `sync: false`)

- [ ] **Step 1: Backfill trigger.** On home load, if `/api/sections` contains `Без теми` and the menu is opened, show the menu item `Розкласти слова без теми`. It calls `POST /api/topics/backfill` and refreshes the tiles, showing `Розкладено N слів`.
- [ ] **Step 2: Design audit.** Run the `audit-ai-design-slop` skill against `pwa/` and screenshots of every state from Tasks 4–5 (light and dark), then fix every confirmed finding. Expected: there are no emoji, gradients or glass effects; touch targets are at least 44 px; text contrast passes WCAG AA; there is no horizontal scroll at 375 px.
- [ ] **Step 3: README.** Update the description (dictionary first), add `ANTHROPIC_API_KEY` to the env table, change `git push -u origin master` to `main`, and describe the new add flow and topics.
- [ ] **Step 4: Run** `pytest -v`. Expected: all tests pass.
- [ ] **Step 5: Commit** `docs: describe dictionary flow and anthropic key`, plus a separate `fix(pwa): …` commit if the audit changed anything.
