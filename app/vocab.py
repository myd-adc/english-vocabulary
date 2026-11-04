"""Vocabulary logic: CRUD, SM-2 scheduling, sections and stats.

Every function takes the owner's `user_id` (Supabase user uuid, as a string) first and only ever
sees that person's words.

Shared in-process by the REST API (app/api.py) and the MCP tools (app/mcp_tools.py).
All functions are synchronous (psycopg); async callers run them in a worker thread.
"""

import logging
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app import config, translator
from app.db import connection

log = logging.getLogger(__name__)

DIRECTIONS = ("forward", "reverse")  # forward = EN -> UA, reverse = UA -> EN
MAX_BULK = 50
FALLBACK_TOPIC = "Без теми"

# A word counts as "difficult" when its ease factor sank below this value or it
# has been forgotten (quality < 3) at least LAPSE_THRESHOLD times, in either direction.
EASE_DIFFICULT = 2.1
LAPSE_THRESHOLD = 2
# "Learned" = three or more successful reviews in a row in the EN -> UA direction
# (the interval has grown to 15+ days by then).
LEARNED_REPETITIONS = 3

CONTENT_FIELDS = (
    "word",
    "translation",
    "transcription",
    "part_of_speech",
    "example",
    "example_translation",
    "notes",
    "section",
    "main_translation",
)
_REQUIRED = ("word", "translation")


class DuplicateWord(Exception):
    """Another word with the same (case-insensitive) spelling already exists."""


class ValidationError(ValueError):
    """Invalid word data (e.g. empty word or translation)."""


def today() -> date:
    return datetime.now(ZoneInfo(config.APP_TIMEZONE)).date()


def _prefix(direction: str) -> str:
    if direction not in DIRECTIONS:
        raise ValueError(f"Unknown direction: {direction!r}")
    return "reverse_" if direction == "reverse" else ""


# ── SM-2 ──────────────────────────────────────────────────────────────────────


def apply_sm2(interval: int, ease: float, reps: int, quality: int) -> tuple[int, float, int]:
    """SM-2: returns (new_interval_days, new_ease, new_repetitions).

    quality is 0-5; below 3 is a lapse: the streak resets, the card returns
    tomorrow and the ease factor drops by 0.2 (floor 1.3).
    """
    if quality < 3:
        return 1, max(1.3, ease - 0.2), 0
    if reps == 0:
        new_interval = 1
    elif reps == 1:
        new_interval = 6
    else:
        new_interval = round(interval * ease)
    new_ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    return new_interval, new_ease, reps + 1


# ── Helpers ───────────────────────────────────────────────────────────────────


def _clean(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _normalize(data: dict) -> dict:
    out = {f: _clean(data.get(f)) for f in CONTENT_FIELDS}
    for f in _REQUIRED:
        if not out[f]:
            raise ValidationError(f"'{f}' is required")
    return out


def _serialize(row: dict) -> dict:
    row = dict(row)
    for key, value in row.items():
        if isinstance(value, (datetime, date)):
            row[key] = value.isoformat()
    return row


def _filters(
    user_id: str,
    section: str | None = None,
    search: str | None = None,
    created_after: str | None = None,
    due_direction: str | None = None,
    difficult: bool = False,
    sections: list[str] | None = None,
) -> tuple[str, list]:
    cond: list[str] = ["user_id = %s"]
    params: list = [user_id]
    if sections is not None:
        # the fallback topic also covers words without a section
        cond.append("(section = ANY(%s) OR section IS NULL)" if FALLBACK_TOPIC in sections
                    else "section = ANY(%s)")
        params.append(list(sections))
    if section is not None:
        cond.append("(section = %s OR section IS NULL)" if section == FALLBACK_TOPIC
                    else "section = %s")
        params.append(section)
    if search:
        cond.append("(word ILIKE %s OR translation ILIKE %s)")
        params += [f"%{search}%"] * 2
    if created_after:
        cond.append("created_at >= %s")
        params.append(created_after)
    if due_direction:
        cond.append(f"{_prefix(due_direction)}next_review <= %s")
        params.append(today())
    if difficult:
        cond.append(
            "(ease_factor < %s OR reverse_ease_factor < %s OR lapses >= %s OR reverse_lapses >= %s)"
        )
        params += [EASE_DIFFICULT, EASE_DIFFICULT, LAPSE_THRESHOLD, LAPSE_THRESHOLD]
    return " WHERE " + " AND ".join(cond), params


# ── CRUD ──────────────────────────────────────────────────────────────────────

_INSERT = f"""
    INSERT INTO words (user_id, {", ".join(CONTENT_FIELDS)}, next_review, reverse_next_review)
    VALUES (%s, {", ".join(["%s"] * len(CONTENT_FIELDS))}, %s, %s)
    ON CONFLICT (user_id, (lower(word))) DO NOTHING
    RETURNING *
"""


def add_words(user_id: str, words: list[dict]) -> dict:
    """Insert up to 50 words. Duplicates (case-insensitive on `word`) are skipped.

    Returns {"inserted": [rows], "skipped": [word strings]}.
    """
    if not words:
        raise ValidationError("No words given")
    if len(words) > MAX_BULK:
        raise ValidationError(f"At most {MAX_BULK} words per call")
    items = [_normalize(w) for w in words]  # validate everything before writing anything
    start = today()
    inserted, skipped = [], []
    with connection() as conn:
        for item in items:
            row = conn.execute(
                _INSERT, [user_id, *(item[f] for f in CONTENT_FIELDS), start, start]
            ).fetchone()
            if row:
                inserted.append(_serialize(row))
            else:
                skipped.append(item["word"])
    return {"inserted": inserted, "skipped": skipped}


def add_word(user_id: str, data: dict) -> dict:
    """Insert one word; raises DuplicateWord if it already exists."""
    result = add_words(user_id, [data])
    if not result["inserted"]:
        raise DuplicateWord(result["skipped"][0])
    return result["inserted"][0]


def get_word(user_id: str, word_id: int) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM words WHERE id = %s AND user_id = %s", [word_id, user_id]
        ).fetchone()
    return _serialize(row) if row else None


def list_words(
    user_id: str,
    section: str | None = None,
    due_direction: str | None = None,
    difficult: bool = False,
    search: str | None = None,
    created_after: str | None = None,
    limit: int = 100,
    offset: int = 0,
    sections: list[str] | None = None,
) -> dict:
    """Return {"total": n, "words": [...]}; due_direction='forward'|'reverse' keeps only due words."""
    where, params = _filters(user_id, section, search, created_after, due_direction, difficult, sections)
    order = f"{_prefix(due_direction)}next_review, id" if due_direction else "created_at DESC, id DESC"
    with connection() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS n FROM words{where}", params).fetchone()["n"]
        rows = conn.execute(
            f"SELECT * FROM words{where} ORDER BY {order} LIMIT %s OFFSET %s",
            [*params, limit, offset],
        ).fetchall()
    return {"total": total, "words": [_serialize(r) for r in rows]}


def get_due(user_id: str, direction: str = "forward", section: str | None = None,
            created_after: str | None = None, sections: list[str] | None = None) -> list[dict]:
    return list_words(user_id, section=section, sections=sections, due_direction=direction,
                      created_after=created_after, limit=1000)["words"]


def update_word(user_id: str, word_id: int, changes: dict) -> dict | None:
    """Partial update of content fields (only keys present in `changes`). SM-2 state is untouched.

    Returns the updated row, None if the id does not exist. Raises DuplicateWord on a name clash.
    """
    unknown = set(changes) - set(CONTENT_FIELDS)
    if unknown:
        raise ValidationError(f"Unknown fields: {', '.join(sorted(unknown))}")
    values = {f: _clean(v) for f, v in changes.items()}
    if "translation" in changes and "main_translation" not in changes:
        values["main_translation"] = None  # the old highlight no longer matches the new text
    for f in _REQUIRED:
        if f in values and not values[f]:
            raise ValidationError(f"'{f}' cannot be empty")
    if not values:
        return get_word(user_id, word_id)
    assignments = ", ".join(f"{f} = %s" for f in values)
    try:
        with connection() as conn:
            row = conn.execute(
                f"UPDATE words SET {assignments} WHERE id = %s AND user_id = %s RETURNING *",
                [*values.values(), word_id, user_id],
            ).fetchone()
    except Exception as err:  # psycopg.errors.UniqueViolation
        if getattr(err, "sqlstate", None) == "23505":
            raise DuplicateWord(values.get("word", "")) from err
        raise
    return _serialize(row) if row else None


def delete_word(user_id: str, word_id: int) -> bool:
    with connection() as conn:
        return conn.execute(
            "DELETE FROM words WHERE id = %s AND user_id = %s", [word_id, user_id]
        ).rowcount > 0


def find_by_word(user_id: str, word: str) -> dict | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM words WHERE user_id = %s AND lower(word) = lower(%s)",
            [user_id, word.strip()],
        ).fetchone()
    return _serialize(row) if row else None


# ── Quick add & topics ────────────────────────────────────────────────────────


def topic_names(user_id: str) -> list[str]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT section FROM words WHERE user_id = %s AND section IS NOT NULL "
            "AND section <> %s ORDER BY section",
            [user_id, FALLBACK_TOPIC],
        ).fetchall()
    return [r["section"] for r in rows]


def quick_add(user_id: str, text: str) -> dict:
    """Translate and store one English word/phrase with an automatic topic.

    status: created | exists | not_english | unavailable
    """
    text = (text or "").strip()
    if not text:
        raise ValidationError("'text' is required")

    def result(status: str, word: dict | None = None) -> dict:
        return {"status": status, "input": text, "word": word}

    t0 = time.monotonic()
    # One pooled connection for both lookups: every checkout costs round-trips to the database.
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM words WHERE user_id = %s AND lower(word) = lower(%s)", [user_id, text]
        ).fetchone()
        topics = [] if row else [
            r["section"]
            for r in conn.execute(
                "SELECT DISTINCT section FROM words WHERE user_id = %s AND section IS NOT NULL "
                "AND section <> %s ORDER BY section",
                [user_id, FALLBACK_TOPIC],
            ).fetchall()
        ]
    if row:
        return result("exists", _serialize(row))
    t1 = time.monotonic()
    try:
        tr = translator.translate(text, topics)
    except translator.TranslationUnavailable:
        return result("unavailable")
    finally:
        t2 = time.monotonic()
        log.info("quick_add db %.2fs, translate %.2fs", t1 - t0, t2 - t1)
    if not tr.is_english:
        return result("not_english")
    lemma = tr.lemma.strip()
    if not lemma:
        return result("unavailable")
    try:
        # The insert skips duplicates itself, so no separate lookup for the lemma first.
        word = add_word(
            user_id,
            {
                "word": lemma,
                "translation": translator.format_parts(tr.parts),
                "main_translation": tr.main,
                "section": tr.topic.strip() or FALLBACK_TOPIC,
            }
        )
    except DuplicateWord:  # lemma already saved (e.g. "ran" when "run" exists)
        return result("exists", find_by_word(user_id, lemma))
    except ValidationError:  # model returned no usable translation
        return result("unavailable")
    finally:
        log.info("quick_add total %.2fs", time.monotonic() - t0)
    return result("created", word)


def rename_topic(user_id: str, old: str, new: str) -> int:
    new = (new or "").strip()
    if not new:
        raise ValidationError("New topic name cannot be empty")
    with connection() as conn:
        where = "(section = %s OR section IS NULL)" if old == FALLBACK_TOPIC else "section = %s"
        return conn.execute(
            f"UPDATE words SET section = %s WHERE user_id = %s AND {where}", [new, user_id, old]
        ).rowcount


def backfill_topics(user_id: str, limit: int = 200) -> dict:
    """Assign topics to words without one, one Claude call per word; stops when Claude is unavailable."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, word, translation FROM words WHERE user_id = %s AND section IS NULL "
            "ORDER BY id LIMIT %s",
            [user_id, limit],
        ).fetchall()
    updated = 0
    for row in rows:
        try:
            topic = translator.suggest_topic(row["word"], row["translation"], topic_names(user_id))
        except translator.TranslationUnavailable:
            break
        with connection() as conn:
            conn.execute(
                "UPDATE words SET section = %s WHERE id = %s AND user_id = %s",
                [topic.strip() or FALLBACK_TOPIC, row["id"], user_id],
            )
        updated += 1
    with connection() as conn:
        remaining = conn.execute(
            "SELECT COUNT(*) AS n FROM words WHERE user_id = %s AND section IS NULL", [user_id]
        ).fetchone()["n"]
    return {"updated": updated, "remaining": remaining}


# ── Review ────────────────────────────────────────────────────────────────────


def review_word(user_id: str, word_id: int, quality: int, direction: str = "forward") -> dict | None:
    """Apply an SM-2 review to one direction's schedule only. None if the id is unknown."""
    p = _prefix(direction)
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM words WHERE id = %s AND user_id = %s FOR UPDATE", [word_id, user_id]
        ).fetchone()
        if row is None:
            return None
        interval, ease, reps = apply_sm2(
            row[f"{p}interval"], row[f"{p}ease_factor"], row[f"{p}repetitions"], quality
        )
        lapses = row[f"{p}lapses"] + (1 if quality < 3 else 0)
        updated = conn.execute(
            f"""UPDATE words SET {p}interval = %s, {p}ease_factor = %s, {p}repetitions = %s,
                    {p}lapses = %s, {p}next_review = %s WHERE id = %s RETURNING *""",
            [interval, ease, reps, lapses, today() + timedelta(days=interval), word_id],
        ).fetchone()
    return _serialize(updated)


# ── Sections & stats ──────────────────────────────────────────────────────────


def list_sections(user_id: str) -> list[dict]:
    """Sections with word counts and due counts (forward / reverse).

    Words without a section are listed under FALLBACK_TOPIC.
    """
    t = today()
    with connection() as conn:
        rows = conn.execute(
            """SELECT name, COUNT(*) AS words,
                      COUNT(*) FILTER (WHERE next_review <= %s) AS due,
                      COUNT(*) FILTER (WHERE reverse_next_review <= %s) AS due_reverse
               FROM (SELECT COALESCE(section, %s) AS name, * FROM words WHERE user_id = %s) w
               GROUP BY name ORDER BY MAX(created_at) DESC""",
            [t, t, FALLBACK_TOPIC, user_id],
        ).fetchall()
    return rows


def get_stats(user_id: str) -> dict:
    t = today()
    with connection() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE next_review <= %s) AS due_today,
                      COUNT(*) FILTER (WHERE reverse_next_review <= %s) AS due_today_reverse,
                      COUNT(*) FILTER (WHERE repetitions >= %s) AS learned,
                      COUNT(*) FILTER (WHERE ease_factor < %s OR reverse_ease_factor < %s
                                         OR lapses >= %s OR reverse_lapses >= %s) AS difficult,
                      COUNT(DISTINCT COALESCE(section, %s)) AS sections
               FROM words WHERE user_id = %s""",
            [t, t, LEARNED_REPETITIONS, EASE_DIFFICULT, EASE_DIFFICULT,
             LAPSE_THRESHOLD, LAPSE_THRESHOLD, FALLBACK_TOPIC, user_id],
        ).fetchone()
    return dict(row)


# ── Accounts ──────────────────────────────────────────────────────────────────


def claim_unowned(user_id: str) -> int:
    """Give words saved before accounts existed (user_id IS NULL) to `user_id`.

    A word is skipped when that person already has the same spelling (the unique index would
    refuse it); such leftovers stay unowned and invisible.
    """
    with connection() as conn:
        return conn.execute(
            """UPDATE words w SET user_id = %s::uuid
               WHERE w.user_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM words o
                                 WHERE o.user_id = %s::uuid AND lower(o.word) = lower(w.word))""",
            [user_id, user_id],
        ).rowcount
