"""LLM-backed EN -> UA translation and topic assignment.

Talks to any OpenAI-compatible chat API (Gemini by default; Groq, Mistral, OpenRouter or
Anthropic work by changing LLM_BASE_URL / LLM_MODEL).
"""

import logging
import re
import time
from dataclasses import dataclass

import openai
import pydantic
from pydantic import BaseModel

from app import config

log = logging.getLogger(__name__)

MAX_PARTS = 3
MAX_MEANINGS = 5
MAX_TOPIC = 40
MAX_LEMMA = 100

# Ukrainian part-of-speech names the model must use; "дієслово" is neuter, so "фразове дієслово".
POS_NAMES = (
    "іменник", "дієслово", "фразове дієслово", "прикметник", "прислівник", "займенник",
    "прийменник", "сполучник", "вигук", "числівник", "частка", "ідіома", "вираз",
)
# Wrong forms models produce, mapped to the right ones.
POS_FIXES = {
    "фразовий дієслово": "фразове дієслово",
    "фразове дієслово": "фразове дієслово",
    "фразовий": "фразове дієслово",
    "phrasal verb": "фразове дієслово",
    "ідіом": "ідіома",
    "вислів": "вираз",
}


def normalize_pos(pos: str) -> str:
    p = " ".join(pos.strip().lower().split())
    return POS_FIXES.get(p, p)

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
meanings, grouped by part of speech, most common first, with part-of-speech names exactly from \
this list: {", ".join(f'"{p}"' for p in POS_NAMES)}, at most {MAX_PARTS} parts of speech and at most {MAX_MEANINGS} \
meanings each.
lemma: fix typos and give the dictionary base form (ran -> run, children -> child, runing -> run), \
but keep phrasal verbs and fixed expressions as typed; lowercase except proper nouns.
main: the 1-2 most common Ukrainian words for the lemma (not for the typed form).
Meanings must be real, natural, standard Ukrainian words; never invent words and never use
Russian words or russianisms (for example not 'неловкий', 'являтися', 'приймати участь').
definition: one short sentence in simple English that explains the meaning of the lemma the way a \
learner's dictionary (Oxford Learner's, Cambridge) does, at most 20 words, without using the lemma \
itself; for an idiom or phrasal verb explain the whole phrase. Empty string if not English.
is_english: false if the input is not English (for example Ukrainian); the other fields may then \
be empty.
{TOPIC_RULES}
The existing topics are given in the user message."""

MAX_DEFINITION = 300

DEFINE_SYSTEM = """You write learner's-dictionary definitions (Oxford Learner's / Cambridge style) \
for a vocabulary-learning app. You get an English word or phrase and its Ukrainian translation, \
which shows the intended sense. Reply with one short sentence in simple English, at most 20 words, \
explaining its meaning without using the word itself; for an idiom or phrasal verb explain the \
whole phrase."""

TOPIC_SYSTEM = f"""You assign a topic to an English word for a vocabulary-learning app. You get the \
word, its Ukrainian translation and the existing topics.
{TOPIC_RULES}"""


def tidy_definition(text: str) -> str:
    """Dictionary style: lowercase start (unless "I" or an acronym), no closing full stop."""
    d = text.strip().rstrip(".").strip()[:MAX_DEFINITION]
    first = d.split(" ", 1)[0]
    if d and first != "I" and not (len(first) > 1 and first.isupper()):
        d = d[0].lower() + d[1:]
    return d


class PosMeanings(BaseModel):
    pos: str
    meanings: list[str]


class Translation(BaseModel):
    is_english: bool
    lemma: str
    parts: list[PosMeanings]
    main: str
    topic: str
    definition: str = ""


class TopicOnly(BaseModel):
    topic: str


class DefinitionOnly(BaseModel):
    definition: str


class TranslationUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Provider:
    api_key: str
    base_url: str
    model: str
    reasoning_effort: str


def providers() -> list[Provider]:
    """The main LLM, then the backups from LLM_2_* ... LLM_9_*, in the order they are tried."""
    main = Provider(config.LLM_API_KEY, config.LLM_BASE_URL, config.LLM_MODEL, config.LLM_REASONING_EFFORT)
    out = [main] if main.api_key else []
    for f in config.LLM_FALLBACKS:
        p = Provider(f["api_key"] or main.api_key, f["base_url"] or main.base_url, f["model"],
                     f["reasoning_effort"])
        if p.api_key:
            out.append(p)
    return out


def enabled() -> bool:
    return bool(providers())


_clients: dict[tuple[str, str], openai.OpenAI] = {}
# Provider -> time.monotonic() until which it is skipped (rate-limited or down).
_cooldown_until: dict[Provider, float] = {}
RATE_LIMIT_COOLDOWN = 60.0
OUTAGE_COOLDOWN = 30.0
MAX_COOLDOWN = 600.0


def _client(provider: Provider) -> openai.OpenAI:
    # One shared client per API keeps the HTTPS connection alive between words (no new TLS handshake).
    # No retries: on a rate limit the SDK would sleep for the server's Retry-After (up to a minute);
    # failing fast moves on to the next provider instead.
    key = (provider.base_url, provider.api_key)
    if key not in _clients:
        _clients[key] = openai.OpenAI(
            api_key=provider.api_key, base_url=provider.base_url, timeout=12.0, max_retries=0
        )
    return _clients[key]


def warm_up() -> None:
    """Open the HTTPS connection to the main LLM ahead of the first word (startup / wake-up),
    so the user's first translation doesn't pay for connection setup. Never raises."""
    if not enabled():
        return
    try:
        _client(providers()[0]).models.list()
    except Exception as e:  # noqa: BLE001 - best effort only
        log.info("translator warm-up skipped: %s", type(e).__name__)


def _cooldown_for(e: Exception) -> float:
    if isinstance(e, openai.RateLimitError):
        try:
            return min(float(e.response.headers.get("retry-after", "")), MAX_COOLDOWN)
        except ValueError:
            return RATE_LIMIT_COOLDOWN
    if isinstance(e, (openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError)):
        return OUTAGE_COOLDOWN
    return 0.0


def _parse_with(provider: Provider, system: str, user: str, output_format: type[BaseModel]):
    completion = _client(provider).chat.completions.parse(
        model=provider.model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format=output_format,
        **({"reasoning_effort": provider.reasoning_effort} if provider.reasoning_effort else {}),
    )
    message = completion.choices[0].message if completion.choices else None
    if message is None or message.refusal or message.parsed is None:
        log.warning("translator %s got no usable output (refusal=%s)", provider.model,
                    getattr(message, "refusal", None))
        raise TranslationUnavailable("no usable response from model")
    return message.parsed


def _parse(system: str, user: str, output_format: type[BaseModel]):
    chain = providers()
    if not chain:
        raise TranslationUnavailable("LLM_API_KEY is not set")
    now = time.monotonic()
    ready = [p for p in chain if _cooldown_until.get(p, 0.0) <= now]
    last_error: Exception = TranslationUnavailable("every LLM is cooling down after a rate limit")
    for provider in ready:
        try:
            return _parse_with(provider, system, user, output_format)
        except (openai.OpenAIError, pydantic.ValidationError, ValueError, TranslationUnavailable) as e:
            last_error = e
            pause = _cooldown_for(e)
            if pause:
                _cooldown_until[provider] = time.monotonic() + pause
            log.warning("translator call to %s failed: %s: %s%s", provider.model, type(e).__name__, e,
                        f" (skipping it for {pause:.0f}s)" if pause else "")
    if isinstance(last_error, TranslationUnavailable):
        raise last_error
    raise TranslationUnavailable(str(last_error)) from last_error


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
        PosMeanings(pos=normalize_pos(p.pos), meanings=p.meanings[:MAX_MEANINGS]) for p in t.parts[:MAX_PARTS]
    ]
    t.lemma = t.lemma.strip()[:MAX_LEMMA]
    t.topic = _match_topic(t.topic, existing_topics)
    t.definition = tidy_definition(t.definition)
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


def define(word: str, translation: str) -> str:
    """A short English definition of `word` (the sense given by its Ukrainian `translation`)."""
    out = _parse(DEFINE_SYSTEM, f"Word: {word}\nTranslation: {translation}", DefinitionOnly)
    definition = tidy_definition(out.definition)
    if not definition:
        raise TranslationUnavailable("empty definition")
    return definition
