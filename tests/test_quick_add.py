import pytest

from app import translator, vocab
from app.translator import PosMeanings, Translation, TranslationUnavailable
from conftest import ALICE

U = ALICE["id"]


class Fake:
    def __init__(self):
        self.calls = 0
        self.topics_seen = []
        self.result = None  # Translation, or None to echo input
        self.exc = None

    def __call__(self, text, existing_topics):
        self.calls += 1
        self.topics_seen.append(list(existing_topics))
        if self.exc:
            raise self.exc
        if self.result is not None:
            return self.result
        return Translation(
            is_english=True,
            lemma=text,
            parts=[PosMeanings(pos="дієслово", meanings=["бігти", "працювати"])],
            main="бігти",
            topic="Рух і спорт",
        )


@pytest.fixture()
def fake_translate(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(translator, "translate", fake)
    return fake


def _tr(**kw):
    base = dict(
        is_english=True,
        lemma="run",
        parts=[PosMeanings(pos="дієслово", meanings=["бігти"])],
        main="бігти",
        topic="Рух і спорт",
    )
    base.update(kw)
    return Translation(**base)


def test_quick_add_creates_with_topic(fake_translate):
    fake_translate.result = _tr()
    r = vocab.quick_add(U, "run")
    assert r["status"] == "created" and r["word"]["section"] == "Рух і спорт"
    assert r["word"]["main_translation"] == "бігти"
    assert r["word"]["translation"].startswith("дієслово: бігти")


def test_quick_add_blank_topic_falls_back(fake_translate):
    fake_translate.result = _tr(topic="  ")
    assert vocab.quick_add(U, "run")["word"]["section"] == vocab.FALLBACK_TOPIC == "Без теми"


def test_quick_add_empty_raises(fake_translate):
    with pytest.raises(vocab.ValidationError):
        vocab.quick_add(U, "   ")


def test_quick_add_existing_skips_claude(fake_translate):
    vocab.add_word(U, {"word": "run", "translation": "бігти"})
    r = vocab.quick_add(U, "  Run ")
    assert r["status"] == "exists" and fake_translate.calls == 0
    assert r["word"]["word"] == "run"


def test_quick_add_normalized_duplicate(fake_translate):
    vocab.add_word(U, {"word": "run", "translation": "бігти"})
    fake_translate.result = _tr()
    r = vocab.quick_add(U, "ran")
    assert r["status"] == "exists" and r["word"]["word"] == "run"


def test_quick_add_passes_existing_topics(fake_translate):
    vocab.add_word(U, {"word": "a", "translation": "а", "section": "Їжа"})
    vocab.quick_add(U, "run")
    assert fake_translate.topics_seen == [["Їжа"]]


def test_quick_add_not_english(fake_translate):
    fake_translate.result = _tr(is_english=False, lemma="", parts=[], main="", topic="")
    r = vocab.quick_add(U, "бігти")
    assert r["status"] == "not_english" and r["word"] is None
    assert vocab.list_words(U)["total"] == 0


def test_quick_add_unavailable(fake_translate):
    fake_translate.exc = TranslationUnavailable("down")
    r = vocab.quick_add(U, "run")
    assert r == {"status": "unavailable", "input": "run", "word": None}


def test_quick_add_phrase_kept(fake_translate):
    assert vocab.quick_add(U, "give up")["word"]["word"] == "give up"


def test_rename_topic_merges():
    vocab.add_word(U, {"word": "a", "translation": "а", "section": "Їжа"})
    vocab.add_word(U, {"word": "b", "translation": "б", "section": "Харчування"})
    assert vocab.rename_topic(U, "Харчування", "Їжа") == 1
    assert vocab.topic_names(U) == ["Їжа"]


def test_rename_topic_blank_raises():
    with pytest.raises(vocab.ValidationError):
        vocab.rename_topic(U, "Їжа", "  ")


def test_list_words_multiple_sections():
    for w, s in (("a", "A"), ("b", "B"), ("c", "C")):
        vocab.add_word(U, {"word": w, "translation": w, "section": s})
    got = {x["word"] for x in vocab.list_words(U, sections=["A", "B"])["words"]}
    assert got == {"a", "b"}
    due = {x["word"] for x in vocab.get_due(U, sections=["B", "C"])}
    assert due == {"b", "c"}


def test_backfill_topics(monkeypatch):
    vocab.add_word(U, {"word": "a", "translation": "а"})
    vocab.add_word(U, {"word": "b", "translation": "б"})
    monkeypatch.setattr(translator, "suggest_topic", lambda w, t, ex: "Тема")
    assert vocab.backfill_topics(U) == {"updated": 2, "remaining": 0}
    assert vocab.topic_names(U) == ["Тема"]


def test_backfill_stops_on_unavailable(monkeypatch):
    vocab.add_word(U, {"word": "a", "translation": "а"})
    vocab.add_word(U, {"word": "b", "translation": "б"})
    n = []

    def fake(w, t, ex):
        n.append(w)
        if len(n) == 2:
            raise TranslationUnavailable("x")
        return "  "

    monkeypatch.setattr(translator, "suggest_topic", fake)
    assert vocab.backfill_topics(U) == {"updated": 1, "remaining": 1}
    assert vocab.find_by_word(U, "a")["section"] == vocab.FALLBACK_TOPIC
