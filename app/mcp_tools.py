"""The remote MCP server: OAuth provider + tools that call app.vocab in-process."""

import asyncio
from typing import Required, TypedDict

from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from mcp.server.auth.middleware.auth_context import get_access_token

from app import config, db, translator, vocab
from app.oauth_provider import VocabularyOAuthProvider


class WordInput(TypedDict, total=False):
    """One English word to save."""

    word: Required[str]  # English word or phrase
    translation: str  # Ukrainian translation; omit to translate automatically
    transcription: str  # IPA, e.g. /ˈæp.əl/
    part_of_speech: str  # e.g. noun, verb, adjective
    example: str  # English example sentence
    example_translation: str  # Ukrainian translation of the example
    notes: str
    section: str  # per-word topic; overrides section_name


oauth_provider = VocabularyOAuthProvider(secret=config.MCP_SECRET, issuer_url=config.ISSUER_URL)

mcp = FastMCP(
    "dicktionary",
    auth_server_provider=oauth_provider,
    auth=AuthSettings(
        issuer_url=config.ISSUER_URL,
        resource_server_url=f"{config.ISSUER_URL}{config.MCP_PATH}",
        client_registration_options=ClientRegistrationOptions(enabled=True),
        revocation_options=RevocationOptions(enabled=True),
    ),
    host="0.0.0.0",
    port=config.PORT,
    streamable_http_path=config.MCP_PATH,
    stateless_http=True,  # no per-session state: survives Render restarts/sleeps
)


class NotSignedIn(RuntimeError):
    """A tool ran without an authenticated account (cannot happen behind the bearer middleware)."""


def _current_user() -> str:
    """Id of the person whose access token made this request; every tool is scoped to it."""
    token = get_access_token()
    if token is None or not token.subject:
        raise NotSignedIn("Not signed in")
    return token.subject


def _fmt(w: dict) -> str:
    extra = ", ".join(
        x for x in (w.get("transcription"), w.get("part_of_speech")) if x
    )
    line = f"- [{w['id']}] {w['word']}" + (f" ({extra})" if extra else "") + f" — {w['translation']}"
    if w.get("section"):
        line += f" | topic: {w['section']}"
    line += (
        f" | EN→UA: ease {w['ease_factor']:.2f}, lapses {w['lapses']}, reps {w['repetitions']}, due {w['next_review']}"
        f" | UA→EN: ease {w['reverse_ease_factor']:.2f}, lapses {w['reverse_lapses']}, due {w['reverse_next_review']}"
    )
    return line


@mcp.tool(
    name="add_words",
    description=(
        "Save English words to the user's spaced-repetition deck (max 50 per call). Use when the "
        "user asks to save words from the conversation. Only 'word' (English) is required: when "
        "'translation' is omitted, the word is translated automatically (lemma, Ukrainian "
        "translation grouped by part of speech) and given a topic. Optional: 'translation' "
        "(Ukrainian), 'transcription' (IPA), 'part_of_speech', 'example' (English sentence), "
        "'example_translation' (Ukrainian), 'notes', 'section' (the word's topic). Pass "
        "section_name to put every word of the batch in one topic (e.g. 'Travel'); without it, "
        "words that come with a translation get a topic chosen automatically. Duplicates are "
        "skipped case-insensitively and reported."
    ),
)
async def add_words(words: list[WordInput], section_name: str | None = None) -> str:
    uid = _current_user()
    def run() -> str:
        auto = [w for w in words if not (w.get("translation") or "").strip()]
        manual = [w for w in words if (w.get("translation") or "").strip()]
        if not words:
            raise vocab.ValidationError("No words given")
        if len(words) > vocab.MAX_BULK:
            raise vocab.ValidationError(f"At most {vocab.MAX_BULK} words per call")
        for w in auto:
            if not (w.get("word") or "").strip():
                raise vocab.ValidationError("'word' is required")

        items = []
        claude_down = False  # circuit breaker: after one failure skip Claude for the whole batch
        for w in manual:
            topic = w.get("section") or section_name
            if (not topic and not claude_down and (w.get("word") or "").strip()
                    and not vocab.find_by_word(uid, w["word"])):
                try:
                    topic = translator.suggest_topic(
                        w["word"].strip(), w["translation"].strip(), vocab.topic_names(uid)
                    ).strip()
                except translator.TranslationUnavailable:
                    topic = None
                    claude_down = True
            if not topic and not w.get("section") and not section_name:
                topic = vocab.FALLBACK_TOPIC
            items.append({**w, "section": topic})
        saved, skipped = [], []
        if items:
            result = vocab.add_words(uid, items)
            saved += [r["word"] for r in result["inserted"]]
            skipped += result["skipped"]

        existing, not_english, unavailable = [], [], []
        for w in auto:
            if claude_down:
                unavailable.append(w["word"].strip())
                continue
            res = vocab.quick_add(uid, w["word"])
            if res["status"] == "created":
                saved.append(res["word"]["word"])
            elif res["status"] == "exists":
                existing.append(res["word"]["word"])
            elif res["status"] == "not_english":
                not_english.append(res["input"])
            else:
                unavailable.append(res["input"])
                claude_down = True

        msg = f"Saved {len(saved)} words."
        if saved:
            msg += f" ({', '.join(saved)})"
        if skipped:
            msg += f" Skipped {len(skipped)} duplicates: {', '.join(skipped)}."
        if existing:
            msg += f" Already saved: {', '.join(existing)}."
        if not_english:
            msg += f" Skipped, not English: {', '.join(not_english)}."
        if unavailable:
            msg += (f" Skipped, translation unavailable: {', '.join(unavailable)}."
                    " Retry later or provide a translation.")
        return msg

    try:
        return await asyncio.to_thread(run)
    except vocab.ValidationError as e:
        return f"Failed to save words: {e}"


@mcp.tool(
    name="list_words",
    description=(
        "List saved words with their SM-2 stats. Optional filters: section_name (the topic name, exact), "
        "only_due (due for review today in either direction), only_difficult (weak words: low "
        "ease factor or repeated lapses), search (substring of word/translation). Each line shows "
        "ease factor, lapses, repetitions and next review for both directions (EN→UA and UA→EN), "
        "so you can see which words the user struggles with. limit default 50, max 200."
    ),
)
async def list_words(
    section_name: str | None = None,
    only_due: bool = False,
    only_difficult: bool = False,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    uid = _current_user()
    limit, offset = max(1, min(limit, 200)), max(0, offset)

    def run() -> dict:
        if not only_due:
            return vocab.list_words(uid, section=section_name, difficult=only_difficult,
                                    search=search, limit=limit, offset=offset)
        # due in either direction: merge both lists
        a = vocab.list_words(uid, section=section_name, due_direction="forward",
                             difficult=only_difficult, search=search, limit=1000)["words"]
        b = vocab.list_words(uid, section=section_name, due_direction="reverse",
                             difficult=only_difficult, search=search, limit=1000)["words"]
        merged = {w["id"]: w for w in [*a, *b]}
        words = sorted(merged.values(), key=lambda w: w["id"])
        return {"total": len(words), "words": words[offset : offset + limit]}

    data = await asyncio.to_thread(run)
    if not data["words"]:
        return "No matching words."
    header = f"{data['total']} matching words; showing {len(data['words'])} from offset {offset}."
    return "\n".join([header, *map(_fmt, data["words"])])


@mcp.tool(
    name="update_word",
    description=(
        "Edit a saved word. Identify it by id (from list_words) or by its English spelling in "
        "'word'. Provide only the fields to change: new_word, translation, transcription, "
        "part_of_speech, example, example_translation, notes, section (the topic). An empty string clears an "
        "optional field. Review progress is kept."
    ),
)
async def update_word(
    id: int | None = None,
    word: str | None = None,
    new_word: str | None = None,
    translation: str | None = None,
    transcription: str | None = None,
    part_of_speech: str | None = None,
    example: str | None = None,
    example_translation: str | None = None,
    notes: str | None = None,
    section: str | None = None,
) -> str:
    uid = _current_user()

    def run() -> str:
        target = id
        if target is None:
            found = vocab.find_by_word(uid, word) if word else None
            if not found:
                return "Word not found (give a valid id or the exact English word)."
            target = found["id"]
        changes = {
            k: v
            for k, v in {
                "word": new_word, "translation": translation, "transcription": transcription,
                "part_of_speech": part_of_speech, "example": example,
                "example_translation": example_translation, "notes": notes, "section": section,
            }.items()
            if v is not None
        }
        try:
            row = vocab.update_word(uid, target, changes)
        except vocab.DuplicateWord:
            return "Another word with that spelling already exists."
        except vocab.ValidationError as e:
            return f"Failed to update: {e}"
        return f"Updated:\n{_fmt(row)}" if row else f"No word with id {target}."

    return await asyncio.to_thread(run)


@mcp.tool(
    name="delete_word",
    description="Permanently delete one word and its review progress, by id (from list_words) or exact English 'word'.",
)
async def delete_word(id: int | None = None, word: str | None = None) -> str:
    uid = _current_user()
    def run() -> str:
        target = id
        if target is None:
            found = vocab.find_by_word(uid, word) if word else None
            if not found:
                return "Word not found (give a valid id or the exact English word)."
            target = found["id"]
        return f"Deleted word {target}." if vocab.delete_word(uid, target) else f"No word with id {target}."

    return await asyncio.to_thread(run)


@mcp.tool(
    name="list_sections",
    description="List the user's topics (named groups of words) with word counts and how many words are due today. Words without a topic appear as 'Без теми'.",
)
async def list_sections() -> str:
    uid = _current_user()
    sections = await asyncio.to_thread(vocab.list_sections, uid)
    if not sections:
        return "No topics yet."
    return "\n".join(
        f"- {s['name']}: {s['words']} words, due today {s['due']} (EN→UA) / {s['due_reverse']} (UA→EN)"
        for s in sections
    )


@mcp.tool(
    name="get_stats",
    description=(
        "Overall statistics: total words, words due today (per direction), learned words "
        "(3+ successful reviews in a row EN→UA), difficult words and number of topics."
    ),
)
async def get_stats() -> str:
    uid = _current_user()
    s = await asyncio.to_thread(vocab.get_stats, uid)
    return (
        f"Total: {s['total']}; due today: {s['due_today']} (EN→UA), {s['due_today_reverse']} (UA→EN); "
        f"learned: {s['learned']}; difficult: {s['difficult']}; topics: {s['sections']}."
    )


# ── Custom routes (unauthenticated) ──────────────────────────────────────────


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    await asyncio.to_thread(db.ping)  # also keeps the Supabase free project from pausing
    return JSONResponse({"status": "ok"})
