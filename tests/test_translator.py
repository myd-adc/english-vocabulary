from types import SimpleNamespace

import httpx
import openai
import pydantic
import pytest

from app import config, translator
from app.translator import (
    PosMeanings,
    Translation,
    TranslationUnavailable,
    TopicOnly,
    enabled,
    format_parts,
    suggest_topic,
    translate,
)


class FakeClient:
    def __init__(self, result=None, exc=None):
        self.calls = []
        self._result = result
        self._exc = exc
        self.chat = SimpleNamespace(completions=SimpleNamespace(parse=self._parse))

    def _parse(self, **kw):
        self.calls.append(kw)
        if self._exc:
            raise self._exc
        return self._result


def _tr(**over):
    data = dict(
        is_english=True,
        lemma="run",
        parts=[PosMeanings(pos="дієслово", meanings=["бігти"])],
        main="бігти",
        topic="Рух",
    )
    data.update(over)
    return Translation(**data)


def _use(monkeypatch, client):
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(translator, "_client", lambda: client)
    return client


def _ok(parsed, refusal=None):
    message = SimpleNamespace(parsed=parsed, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


REFUSAL = _ok(None, refusal="refusal")


def test_format_parts():
    parts = [
        PosMeanings(pos="дієслово", meanings=["бігти", "керувати"]),
        PosMeanings(pos="іменник", meanings=["біг"]),
    ]
    assert format_parts(parts) == "дієслово: бігти, керувати\nіменник: біг"


def test_translate_truncates(monkeypatch):
    parts = [PosMeanings(pos=f"p{i}", meanings=[f"m{j}" for j in range(7)]) for i in range(4)]
    _use(monkeypatch, FakeClient(_ok(_tr(parts=parts))))
    t = translate("run", [])
    assert len(t.parts) == 3 and all(len(p.meanings) <= 5 for p in t.parts)


def test_topic_matches_existing_case_insensitive(monkeypatch):
    _use(monkeypatch, FakeClient(_ok(_tr(topic="робота"))))
    assert translate("hire", ["Робота", "Їжа"]).topic == "Робота"


def test_translate_passes_model_and_topics(monkeypatch):
    c = _use(monkeypatch, FakeClient(_ok(_tr())))
    translate("hire", ["Хобі вдома"])
    kw = c.calls[0]
    assert kw["model"] == config.LLM_MODEL
    assert kw["response_format"] is Translation
    system, user = kw["messages"]
    assert system["role"] == "system" and "Хобі вдома" not in system["content"]
    assert "Хобі вдома" in user["content"]


def test_api_error_becomes_unavailable(monkeypatch):
    err = openai.APIConnectionError(request=httpx.Request("POST", "https://x"))
    _use(monkeypatch, FakeClient(exc=err))
    with pytest.raises(TranslationUnavailable):
        translate("run", [])


def test_refusal_becomes_unavailable(monkeypatch):
    _use(monkeypatch, FakeClient(REFUSAL))
    with pytest.raises(TranslationUnavailable):
        translate("run", [])


def test_disabled_without_key(monkeypatch):
    monkeypatch.setattr(config, "LLM_API_KEY", "")
    assert enabled() is False
    with pytest.raises(TranslationUnavailable):
        translate("run", [])


def test_suggest_topic(monkeypatch):
    c = _use(monkeypatch, FakeClient(_ok(TopicOnly(topic="їжа"))))
    assert suggest_topic("bread", "хліб", ["Їжа"]) == "Їжа"
    assert c.calls[0]["response_format"] is TopicOnly


def test_suggest_topic_error(monkeypatch):
    _use(monkeypatch, FakeClient(REFUSAL))
    with pytest.raises(TranslationUnavailable):
        suggest_topic("bread", "хліб", [])


def test_invalid_structured_output_becomes_unavailable(monkeypatch):
    try:
        Translation.model_validate({})
    except pydantic.ValidationError as e:
        err = e
    _use(monkeypatch, FakeClient(exc=err))
    with pytest.raises(TranslationUnavailable):
        translate("run", [])
    with pytest.raises(TranslationUnavailable):
        suggest_topic("run", "бігти", [])


def test_topic_slash_replaced_and_capped(monkeypatch):
    _use(monkeypatch, FakeClient(result=_ok(_tr(topic="Їжа/напої  ", lemma="x" * 150))))
    t = translate("x", [])
    assert t.topic == "Їжа і напої" and len(t.lemma) == 100
    _use(monkeypatch, FakeClient(result=_ok(TopicOnly(topic="Т" * 80))))
    assert len(suggest_topic("w", "т", [])) == 40
    _use(monkeypatch, FakeClient(result=_ok(TopicOnly(topic="А/Б"))))
    assert suggest_topic("w", "т", []) == "А і Б"
    assert "/" in translator.TOPIC_RULES  # rule is mentioned in the prompt


def test_parse_failure_is_logged(monkeypatch, caplog):
    _use(monkeypatch, FakeClient(exc=ValueError("boom")))
    with caplog.at_level("WARNING", logger="app.translator"), pytest.raises(TranslationUnavailable):
        translate("x", [])
    assert "ValueError" in caplog.text and "boom" in caplog.text and "test-key" not in caplog.text
    caplog.clear()
    _use(monkeypatch, FakeClient(result=REFUSAL))
    with caplog.at_level("WARNING", logger="app.translator"), pytest.raises(TranslationUnavailable):
        translate("x", [])
    assert "refusal" in caplog.text


def test_reasoning_effort_passed_only_when_set(monkeypatch):
    c = _use(monkeypatch, FakeClient(_ok(_tr())))
    monkeypatch.setattr(config, "LLM_REASONING_EFFORT", "")
    translate("run", [])
    assert "reasoning_effort" not in c.calls[-1]
    monkeypatch.setattr(config, "LLM_REASONING_EFFORT", "low")
    translate("run", [])
    assert c.calls[-1]["reasoning_effort"] == "low"
