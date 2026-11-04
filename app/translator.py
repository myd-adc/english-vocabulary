"""Claude-backed EN -> UA translation and topic assignment."""

import anthropic
import pydantic
from pydantic import BaseModel

from app import config

MODEL = "claude-haiku-5-5"
MAX_PARTS = 3
MAX_MEANINGS = 5

TOPIC_RULES = (
    "topic: pick one from the provided list of existing topics when one fits; otherwise create a "
    "broad Ukrainian topic of 1-3 words, capitalised (aim for roughly 10-20 topics in total). "
    "Use exactly 'Загальне' for general words such as 'however' or 'available'."
)

SYSTEM = f"""You are an English to Ukrainian dictionary for a vocabulary-learning app.
Translate the user's English word or phrase like a good bilingual dictionary: give only common \
meanings, grouped by part of speech (part-of-speech names in Ukrainian, e.g. "дієслово", \
"іменник"), most common first, at most {MAX_PARTS} parts of speech and at most {MAX_MEANINGS} \
meanings each.
lemma: fix typos and give the dictionary base form (ran -> run, children -> child, runing -> run), \
but keep phrasal verbs and fixed expressions as typed; lowercase except proper nouns.
main: the 1-2 most common Ukrainian words for it.
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
    return bool(config.ANTHROPIC_API_KEY)


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=15.0, max_retries=1)


def _parse(system: str, user: str, output_format: type[BaseModel]):
    if not enabled():
        raise TranslationUnavailable("ANTHROPIC_API_KEY is not set")
    try:
        msg = _client().messages.parse(
            model=MODEL,
            max_tokens=1024,
            output_config={"effort": "low"},
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=output_format,
        )
    except (anthropic.APIError, pydantic.ValidationError, ValueError) as e:
        raise TranslationUnavailable(str(e)) from e
    if msg.stop_reason == "refusal" or msg.parsed_output is None:
        raise TranslationUnavailable("no usable response from model")
    return msg.parsed_output


def _match_topic(topic: str, existing_topics: list[str]) -> str:
    topic = topic.strip()
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
