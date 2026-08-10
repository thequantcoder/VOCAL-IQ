"""Mid-call language detection/switch + voice/pronunciation resolution (Day 25)."""

from __future__ import annotations

from app.loop.language import LanguageSwitcher, apply_pronunciations, resolve_voice


def test_switcher_debounces_before_switching() -> None:
    sw = LanguageSwitcher(default="en", stability=2)
    assert sw.observe("es") is None  # 1st es — not yet
    assert sw.observe("es") == "es"  # 2nd es — switch
    assert sw.current == "es"
    assert sw.observe("es") is None  # already es — no switch


def test_switcher_ignores_noise_and_und() -> None:
    sw = LanguageSwitcher(default="en", stability=2)
    assert sw.observe("es") is None  # candidate es (1)
    assert sw.observe("fr") is None  # candidate resets to fr (1)
    assert sw.observe(None) is None  # noise resets
    assert sw.observe("und") is None
    assert sw.current == "en"  # never switched


def test_switcher_can_switch_back() -> None:
    sw = LanguageSwitcher(default="en", stability=1)
    assert sw.observe("es") == "es"
    assert sw.observe("en") == "en"


def test_resolve_voice_falls_back_to_default_language() -> None:
    langs = [{"code": "en", "voiceId": "v-en"}, {"code": "es", "voiceId": "v-es"}, {"code": "fr", "voiceId": ""}]
    assert resolve_voice(langs, "en", "es") == "v-es"
    assert resolve_voice(langs, "en", "fr") == "v-en"  # fr has no voice → default
    assert resolve_voice(langs, "en", "de") == "v-en"  # unknown → default
    assert resolve_voice([], "en", "es") is None


def test_apply_pronunciations() -> None:
    entries = [{"term": "VocalIQ", "say": "Vocal I Q"}, {"term": "kubectl", "say": "cube control"}]
    assert apply_pronunciations("Use VocalIQ and kubectl.", entries) == "Use Vocal I Q and cube control."
    assert apply_pronunciations("kubectld", entries) == "kubectld"  # substring untouched
