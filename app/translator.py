"""LLM-backed EN -> UA translation and topic assignment.

Talks to any OpenAI-compatible chat API (Gemini by default; Groq, Mistral, OpenRouter or
Anthropic work by changing LLM_BASE_URL / LLM_MODEL).
"""

import logging
import re

import openai
import pydantic
from pydantic import BaseModel

from app import config

log = logging.getLogger(__name__)

MAX_PARTS = 3
MAX_MEANINGS = 5
MAX_TOPIC = 40
MAX_LEMMA = 100

TOPIC_RULES = (
    "topic: the subject area where a learner would look for this word, as a Ukrainian noun phrase "
    "of 1-3 words, capitalised, for example 'Їжа', 'Робота', 'Подорожі', 'Тіло і здоров\'я', "
    "'Емоції', 'Дім', 'Природа', 'Навчання', 'Рух і спорт', 'Гроші', 'Стосунки'. "
    "Reuse a topic from the provided list of existing topics whenever it fits; otherwise create a "
    "new broad one (aim for roughly 10-20 topics in total). "
    "Never use vague topics such as 'Дія', 'Предмет', 'Слово' or 'Інше'. "
    "Use exactly 'Загальне' only for function words and very general words with no subject area, "
    "such as 'however', 'available' or 'thing'. "
    "Never use the character '/' in a topic name."
)

SYSTEM = f"""You are an English to Ukrainian dictionary for a vocabulary-learning app.
Translate the user's English word or phrase like a good bilingual dictionary: give only common \
meanings, grouped by part of speech (part-of-speech names in Ukrainian, e.g. "дієслово", \
"іменник"), most common first, at most {MAX_PARTS} parts of speech and at most {MAX_MEANINGS} \
meanings each.
lemma: fix typos and give the dictionary base form (ran -> run, children -> child, runing -> run), \
but keep phrasal verbs and fixed expressions as typed; lowercase except proper nouns.
main: the 1-2 most common Ukrainian words for the lemma (not for the typed form).
Meanings must be real, natural, standard Ukrainian words; never invent words and never use
Russian words or russianisms (for example not 'неловкий', 'являтися', 'приймати участь').
is_english: false if the input is not English (for example Ukrainian); the other fields may then \
be empty.
{TOPIC_RULES}
The existing topics are given in the user message."""

TOPIC_SYSTEM = f"""You assign a topic to an English word for a vocabulary-learning app. You get the \
word, its Ukrainian translation and the existing topics.
{TOPIC_RULES}"""


class PosMeanings(BaseModel):
    pos: str
    meanings: list[str]


class Translation(BaseModel):
    is_english: bool
    lemma: str
    parts: list[PosMeanings]
    main: str
    topic: str


class TopicOnly(BaseModel):
    topic: str


class TranslationUnavailable(Exception):
    pass


def enabled() -> bool:
    return bool(config.LLM_API_KEY)


_cached_client: openai.OpenAI | None = None


def _client() -> openai.OpenAI:
    # One shared client keeps the HTTPS connection alive between words (no new TLS handshake).
    # No retries: on a rate limit the SDK would sleep for the server's Retry-After (up to a minute);
    # failing fast lets the user type the translation or try again.
    global _cached_client
    if _cached_client is None:
        _cached_client = openai.OpenAI(
            api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL, timeout=12.0, max_retries=0
        )
    return _cached_client


def warm_up() -> None:
    """Open the HTTPS connection to the LLM ahead of the first word (startup / wake-up),
    so the user's first translation doesn't pay for connection setup. Never raises."""
    if not enabled():
        return
    try:
        _client().models.list()
    except Exception as e:  # noqa: BLE001 - best effort only
        log.info("translator warm-up skipped: %s", type(e).__name__)


def _parse(system: str, user: str, output_format: type[BaseModel]):
    if not enabled():
        raise TranslationUnavailable("LLM_API_KEY is not set")
    try:
        completion = _client().chat.completions.parse(
            model=config.LLM_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format=output_format,
            **({"reasoning_effort": config.LLM_REASONING_EFFORT} if config.LLM_REASONING_EFFORT else {}),
        )
    except (openai.OpenAIError, pydantic.ValidationError, ValueError) as e:
        log.warning("translator call failed: %s: %s", type(e).__name__, e)
        raise TranslationUnavailable(str(e)) from e
    message = completion.choices[0].message if completion.choices else None
    if message is None or message.refusal or message.parsed is None:
        log.warning("translator got no usable output (refusal=%s)", getattr(message, "refusal", None))
        raise TranslationUnavailable("no usable response from model")
    return message.parsed


def _match_topic(topic: str, existing_topics: list[str]) -> str:
    topic = re.sub(r"\s+", " ", topic.replace("/", " і ")).strip()[:MAX_TOPIC]
    for t in existing_topics:
        if t.strip().lower() == topic.lower():
            return t
    return topic


def _topics_line(existing_topics: list[str]) -> str:
    return ", ".join(existing_topics) if existing_topics else "(none yet)"


def translate(text: str, existing_topics: list[str]) -> Translation:
    user = f"Existing topics: {_topics_line(existing_topics)}\n\nWord or phrase: {text}"
    t = _parse(SYSTEM, user, Translation)
    t.parts = [
        PosMeanings(pos=p.pos, meanings=p.meanings[:MAX_MEANINGS]) for p in t.parts[:MAX_PARTS]
    ]
    t.lemma = t.lemma.strip()[:MAX_LEMMA]
    t.topic = _match_topic(t.topic, existing_topics)
    return t


def format_parts(parts: list[PosMeanings]) -> str:
    return "\n".join(f"{p.pos}: {', '.join(p.meanings)}" for p in parts)


def suggest_topic(word: str, translation: str, existing_topics: list[str]) -> str:
    user = (
        f"Existing topics: {_topics_line(existing_topics)}\n\n"
        f"Word: {word}\nTranslation: {translation}"
    )
    out = _parse(TOPIC_SYSTEM, user, TopicOnly)
    return _match_topic(out.topic, existing_topics)
