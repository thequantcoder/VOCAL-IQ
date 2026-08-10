"""Day 77 — emotion-aware voice modulation: the pure mood-estimation + tone-mapping core.

Deterministic, no keys, no network. Guards the appropriateness contract (self-audit A): an upset
caller is never sped up or given an animated voice, and de-escalation always beats enthusiasm.
"""

from __future__ import annotations

from app.loop.emotion import (
    DEFAULT_POLICY,
    EmotionPolicy,
    classify_tone,
    estimate_sentiment,
    modulate,
    resolve_expressive_settings,
)
from app.providers.contracts import NEUTRAL_SETTINGS


def _enabled(**over: object) -> EmotionPolicy:
    from dataclasses import replace

    return replace(EmotionPolicy(enabled=True), **over)  # type: ignore[arg-type]


# ── estimate_sentiment ─────────────────────────────────────────────────────────────────────────
def test_estimate_neutral_for_empty_or_plain() -> None:
    assert estimate_sentiment("") == estimate_sentiment("   ") == estimate_sentiment("okay then")


def test_estimate_detects_anger() -> None:
    s = estimate_sentiment("This is absolutely ridiculous and completely unacceptable!")
    assert s.anger >= 0.5
    assert s.sentiment_score < 0


def test_estimate_detects_sadness_without_anger() -> None:
    s = estimate_sentiment("I'm really disappointed and worried about this problem.")
    assert s.anger < 0.5
    assert s.sentiment_score <= -0.35


def test_estimate_detects_positive() -> None:
    s = estimate_sentiment("This is great, thank you so much, perfect!")
    assert s.sentiment_score >= 0.4
    assert s.anger == 0.0


def test_estimate_detects_buying_intent() -> None:
    s = estimate_sentiment("I'm interested — how much to sign up?")
    assert s.buying_intent > 0


def test_scores_stay_normalised() -> None:
    s = estimate_sentiment("terrible terrible terrible worst hate hate scam useless " * 5)
    assert 0.0 <= s.anger <= 1.0
    assert -1.0 <= s.sentiment_score <= 1.0


# ── classify_tone ───────────────────────────────────────────────────────────────────────────────
def test_disabled_policy_is_always_neutral() -> None:
    assert classify_tone(estimate_sentiment("this is a scam!!!"), DEFAULT_POLICY) == "neutral"


def test_angry_caller_gets_reassuring() -> None:
    assert classify_tone(estimate_sentiment("this is ridiculous and unacceptable"), _enabled()) == "reassuring"


def test_sad_caller_gets_empathetic() -> None:
    assert classify_tone(estimate_sentiment("I'm so disappointed and upset"), _enabled()) == "empathetic"


def test_happy_caller_gets_upbeat() -> None:
    assert classify_tone(estimate_sentiment("awesome, thank you, this is perfect"), _enabled()) == "upbeat"


def test_angry_but_positive_words_never_upbeat() -> None:
    # "I'd love to buy but this is ridiculous and unacceptable" → distress wins.
    tone = classify_tone(estimate_sentiment("I love it but this is ridiculous and unacceptable"), _enabled())
    assert tone == "reassuring"


# ── resolve_expressive_settings (guardrails) ─────────────────────────────────────────────────────
def test_neutral_tone_is_exact_baseline() -> None:
    assert resolve_expressive_settings("neutral", _enabled()) == NEUTRAL_SETTINGS


def test_care_tones_never_sped_up_or_animated_even_when_maxed() -> None:
    for tone in ("empathetic", "reassuring"):
        s = resolve_expressive_settings(tone, _enabled(expressiveness="expressive", max_style=1.0))
        assert s.speed <= 1.0
        assert s.style <= 0.2
        assert s.stability >= 0.6


def test_upbeat_is_brighter_and_faster() -> None:
    s = resolve_expressive_settings("upbeat", _enabled())
    assert s.style > 0.0
    assert s.speed > 1.0
    assert s.stability < NEUTRAL_SETTINGS.stability


def test_max_style_caps_exaggeration() -> None:
    assert resolve_expressive_settings("upbeat", _enabled(max_style=0.1)).style <= 0.1


def test_bounds_are_respected_for_all_tones() -> None:
    for tone in ("empathetic", "reassuring", "upbeat"):
        s = resolve_expressive_settings(tone, _enabled(expressiveness="expressive", max_style=1.0))
        assert 0.15 <= s.stability <= 0.95
        assert 0.5 <= s.similarity_boost <= 0.9
        assert 0.85 <= s.speed <= 1.12


# ── modulate (end-to-end) ─────────────────────────────────────────────────────────────────────────
def test_modulate_angry_end_to_end() -> None:
    tone, settings = modulate("this is absolutely unacceptable!!!", _enabled())
    assert tone == "reassuring"
    assert settings.speed <= 1.0


def test_modulate_disabled_is_neutral() -> None:
    tone, settings = modulate("this is wonderful, thank you!", DEFAULT_POLICY)
    assert tone == "neutral"
    assert settings == NEUTRAL_SETTINGS
