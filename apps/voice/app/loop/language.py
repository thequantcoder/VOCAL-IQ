"""Mid-call language detection + switching (Day 25).

The STT provider reports a detected language per result; `LanguageSwitcher` debounces
that (N consecutive same detections) so the agent doesn't flap on a single mixed word,
then flips the active language once. `resolve_voice` + `apply_pronunciations` mirror the
shared TS helpers so the loop can swap the TTS voice + fix name/brand pronunciation. Pure
+ deterministic → fully unit-tested (self-audit A).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(slots=True)
class LanguageSwitcher:
    default: str
    stability: int = 2  # consecutive detections required before switching
    current: str = field(init=False)
    _candidate: str | None = field(default=None, init=False)
    _count: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self.current = self.default

    def observe(self, detected: str | None) -> str | None:
        """Feed a detected language; return the new active language IF a switch happened."""
        if not detected or detected in ("und", self.current):
            self._candidate = None
            self._count = 0
            return None
        if detected == self._candidate:
            self._count += 1
        else:
            self._candidate = detected
            self._count = 1
        if self._count >= self.stability:
            self.current = detected
            self._candidate = None
            self._count = 0
            return detected
        return None


def resolve_voice(languages: list[dict[str, str]], default_language: str, lang: str) -> str | None:
    """TTS voice for a language: exact configured voice → default-language voice → None."""
    for entry in languages:
        if entry.get("code") == lang and entry.get("voiceId"):
            return entry["voiceId"]
    for entry in languages:
        if entry.get("code") == default_language and entry.get("voiceId"):
            return entry["voiceId"]
    return None


def apply_pronunciations(text: str, entries: list[dict[str, str]]) -> str:
    """Replace each term (whole-word, case-insensitive) with its spoken form; longest first."""
    out = text
    for entry in sorted(entries, key=lambda e: len(e.get("term", "")), reverse=True):
        term = entry.get("term", "")
        say = entry.get("say", "")
        if not term:
            continue
        out = re.sub(rf"\b{re.escape(term)}\b", say, out, flags=re.IGNORECASE)
    return out
