"""Emotion-aware voice modulation (Day 77) — the voice-loop side of @vocaliq/shared's emotion-voice.

Two pure pieces, both zero-cost and zero-latency (self-audit F — no network, no model call, just a
little string + float work), so the agent's *next* line is spoken in a tone that fits the caller:

  1. `estimate_sentiment(text)` — a fast, deterministic lexicon estimate of the caller's mood from
     their last utterance, in the exact `SentimentSignal` shape Day 73 defined. This is the live
     signal the loop never had before; it's a heuristic first pass (no LLM), replaceable behind the
     same interface by a real classifier later.
  2. `classify_tone` + `resolve_expressive_settings` — a byte-for-byte mirror of the shared TS logic,
     so voice/api/web agree on how a mood maps to expressive TTS controls. Guardrails (self-audit A):
     an upset caller is NEVER sped up or given an animated/"cheerful" voice; de-escalation always
     beats enthusiasm; exaggeration is clamped by the policy's `max_style`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.providers.contracts import NEUTRAL_SETTINGS, ExpressiveSettings

EmotionTone = Literal["neutral", "empathetic", "reassuring", "upbeat"]
Expressiveness = Literal["subtle", "balanced", "expressive"]


@dataclass(frozen=True, slots=True)
class SentimentSignal:
    """Per-turn caller mood. Mirrors the TS `SentimentSignal` — sentimentScore is -1..1
    (negative→positive); anger/frustration/buyingIntent are 0..1 intensities."""

    sentiment_score: float = 0.0
    anger: float = 0.0
    frustration: float = 0.0
    buying_intent: float = 0.0


@dataclass(frozen=True, slots=True)
class EmotionPolicy:
    """Per-agent emotion policy (mirror of the TS `EmotionPolicy`). Disabled by default so nothing
    changes for an agent that hasn't opted in."""

    enabled: bool = False
    expressiveness: Expressiveness = "balanced"
    max_style: float = 0.6
    anger_threshold: float = 0.5
    negative_threshold: float = -0.35
    positive_threshold: float = 0.4

    @staticmethod
    def from_dict(raw: object) -> "EmotionPolicy":
        """Build a policy from the Agent.emotionPolicy JSON blob (camelCase keys, as the API stores
        it). Unknown/invalid values fall back to the safe defaults — a bad blob can never crash a
        call, it just yields the neutral (disabled) voice."""
        d = raw if isinstance(raw, dict) else {}

        def num(key: str, default: float) -> float:
            v = d.get(key, default)
            return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else default

        expr = d.get("expressiveness", "balanced")
        if expr not in ("subtle", "balanced", "expressive"):
            expr = "balanced"
        return EmotionPolicy(
            enabled=bool(d.get("enabled", False)),
            expressiveness=expr,  # type: ignore[arg-type]
            max_style=_clamp(num("maxStyle", 0.6), 0.0, 1.0),
            anger_threshold=_clamp(num("angerThreshold", 0.5), 0.0, 1.0),
            negative_threshold=_clamp(num("negativeThreshold", -0.35), -1.0, 0.0),
            positive_threshold=_clamp(num("positiveThreshold", 0.4), 0.0, 1.0),
        )


DEFAULT_POLICY = EmotionPolicy()

# ── lexicons (deterministic, cheap) ──────────────────────────────────────────────────────────────
_ANGER_TERMS = (
    "angry", "furious", "outraged", "ridiculous", "unacceptable", "outrageous", "terrible",
    "worst", "useless", "hate", "stupid", "scam", "disgusting", "appalling", "incompetent",
    "garbage", "pathetic", "nonsense", "fed up", "sick of", "waste of", "rip off",
)
_FRUSTRATION_TERMS = (
    "frustrated", "annoyed", "annoying", "still not", "keep", "waiting", "forever", "third time",
    "again and again", "nobody", "no one", "unhelpful", "confusing", "complicated", "tired of",
    "over and over",
)
_NEGATIVE_TERMS = (
    "sad", "disappointed", "unhappy", "upset", "worried", "anxious", "sorry", "problem", "issue",
    "broken", "not working", "doesn't work", "does not work", "can't", "cannot", "won't", "refund",
    "cancel", "complaint", "difficult", "unfortunately", "struggling", "concerned", "afraid",
    "stressed",
)
_POSITIVE_TERMS = (
    "great", "thanks", "thank you", "awesome", "perfect", "love", "happy", "excellent", "wonderful",
    "amazing", "fantastic", "appreciate", "brilliant", "pleased", "glad", "helpful", "sounds good",
    "yes please", "great news", "delighted",
)
_BUYING_TERMS = (
    "buy", "purchase", "order", "sign up", "signup", "subscribe", "pricing", "how much",
    "interested", "upgrade", "demo", "get started", "quote",
)

_WORD_RE = re.compile(r"[^a-z0-9'\s]+")


def _norm(text: str) -> str:
    """Lowercase, strip punctuation to spaces (keep apostrophes), space-pad so ` term ` matches
    whole words and phrases alike."""
    cleaned = _WORD_RE.sub(" ", text.lower())
    return f" {' '.join(cleaned.split())} "


def _count(padded: str, terms: tuple[str, ...]) -> int:
    return sum(1 for t in terms if f" {t} " in padded)


def _clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def estimate_sentiment(text: str) -> SentimentSignal:
    """Estimate caller mood from an utterance. Deterministic + allocation-light. One clear anger
    word already crosses the default de-escalation threshold; positivity needs to clearly outweigh
    negativity before the voice brightens (conservative on purpose — self-audit A)."""
    if not text or not text.strip():
        return SentimentSignal()
    padded = _norm(text)
    exclaim = min(text.count("!"), 3)
    all_caps = sum(1 for w in text.split() if len(w) >= 3 and w.isupper())

    anger_hits = _count(padded, _ANGER_TERMS)
    frustration_hits = _count(padded, _FRUSTRATION_TERMS)
    positive_hits = _count(padded, _POSITIVE_TERMS)
    negative_hits = _count(padded, _NEGATIVE_TERMS)
    buying_hits = _count(padded, _BUYING_TERMS)

    # Exclamation/shouting amplify anger ONLY alongside real negativity — an enthusiastic "perfect!"
    # must not read as angry (appropriateness — self-audit A).
    amp = (0.1 * exclaim + 0.15 * all_caps) if (anger_hits or negative_hits or frustration_hits) else 0.0
    anger = _clamp(0.5 * anger_hits + 0.1 * frustration_hits + amp, 0, 1)
    frustration = _clamp(0.4 * frustration_hits + 0.2 * anger_hits + amp, 0, 1)
    sentiment_score = _clamp(0.35 * positive_hits - 0.35 * negative_hits - 0.5 * anger_hits, -1, 1)
    buying_intent = _clamp(0.5 * buying_hits, 0, 1)
    return SentimentSignal(sentiment_score, anger, frustration, buying_intent)


# ── mood → expressive settings (mirror of TS resolveExpressiveSettings) ────────────────────────────
_TONE_TARGETS: dict[EmotionTone, ExpressiveSettings] = {
    "neutral": NEUTRAL_SETTINGS,
    "empathetic": ExpressiveSettings(0.68, 0.8, 0.12, 0.96, True),
    "reassuring": ExpressiveSettings(0.82, 0.78, 0.0, 0.93, True),
    "upbeat": ExpressiveSettings(0.38, 0.75, 0.45, 1.05, True),
}
_EXPRESSIVENESS_SCALE: dict[Expressiveness, float] = {"subtle": 0.5, "balanced": 1.0, "expressive": 1.4}
_STABILITY_BOUNDS = (0.15, 0.95)
_SIMILARITY_BOUNDS = (0.5, 0.9)
_SPEED_BOUNDS = (0.85, 1.12)


def classify_tone(signal: SentimentSignal, policy: EmotionPolicy) -> EmotionTone:
    """Pick the vocal strategy. Distress (anger→sadness) is handled before positivity, so an angry
    or upset caller can never be classified `upbeat`."""
    if not policy.enabled:
        return "neutral"
    if signal.anger >= policy.anger_threshold or signal.frustration >= policy.anger_threshold:
        return "reassuring"
    if signal.sentiment_score <= policy.negative_threshold:
        return "empathetic"
    if signal.sentiment_score >= policy.positive_threshold:
        return "upbeat"
    return "neutral"


def resolve_expressive_settings(tone: EmotionTone, policy: EmotionPolicy) -> ExpressiveSettings:
    """Interpolate neutral→tone by the expressiveness scale, clamp to natural bounds + `max_style`,
    then apply the care-tone guardrail (empathetic/reassuring never sped up or animated)."""
    if tone == "neutral":
        return NEUTRAL_SETTINGS
    target = _TONE_TARGETS[tone]
    scale = _EXPRESSIVENESS_SCALE[policy.expressiveness]

    def lerp(frm: float, to: float) -> float:
        return frm + (to - frm) * scale

    stability = _clamp(lerp(NEUTRAL_SETTINGS.stability, target.stability), *_STABILITY_BOUNDS)
    similarity = _clamp(
        lerp(NEUTRAL_SETTINGS.similarity_boost, target.similarity_boost), *_SIMILARITY_BOUNDS
    )
    style = _clamp(min(lerp(NEUTRAL_SETTINGS.style, target.style), policy.max_style), 0.0, 1.0)
    speed = _clamp(lerp(NEUTRAL_SETTINGS.speed, target.speed), *_SPEED_BOUNDS)

    if tone in ("empathetic", "reassuring"):
        speed = min(speed, 1.0)
        style = min(style, 0.2)
        stability = max(stability, 0.7 if tone == "reassuring" else 0.6)

    return ExpressiveSettings(
        stability=stability,
        similarity_boost=similarity,
        style=style,
        speed=speed,
        use_speaker_boost=target.use_speaker_boost,
    )


def modulate(text: str, policy: EmotionPolicy) -> tuple[EmotionTone, ExpressiveSettings]:
    """Caller utterance + policy → (tone, settings) for the next spoken line. The one call the loop
    makes per caller turn."""
    signal = estimate_sentiment(text)
    tone = classify_tone(signal, policy)
    return tone, resolve_expressive_settings(tone, policy)
