"""PCI-safe pay-by-voice primitives for the voice loop (Day 78).

VocalIQ runs the **PCI out-of-scope (SAQ-A)** model: a customer's card is captured by a PCI-DSS
provider (DTMF/tokenised at the media layer), so the voice loop normally never sees a card number at
all — it only asks the provider to capture+charge and gets back a token + result. Two safety nets
live here:

  1. `strip_card_data` / `contains_card_data` — a Luhn-checked card detector (mirror of the TS
     `stripCardData`/`containsCardData` in @vocaliq/shared) used to scrub any card number that a
     caller SPEAKS (and STT transcribes) BEFORE it can reach a transcript, event, log, or the LLM
     context. Card data must never be stored anywhere (self-audit C).
  2. `PciCapture` — a gated provider seam (mirrors the Day-26 VoiceCloner / Day-76 FineTuneProvider).
     `DisabledPciCapture` refuses clearly when no PCI provider is configured; a real adapter swaps in
     when `PCI_CAPTURE_*` is set. The loop only ever handles the amount + a `PciCaptureResult` — never
     a PAN.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

# 13–19 digit runs (optional single spaces/dashes between digits), Luhn-checked below.
_CARD_RE = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def luhn_valid(candidate: str) -> bool:
    """Luhn checksum — mirrors the TS `luhnValid`. Keeps ordinary long numbers (order ids, amounts)
    from being mistaken for cards."""
    d = _digits(candidate)
    if len(d) < 13 or len(d) > 19:
        return False
    total = 0
    alt = False
    for ch in reversed(d):
        n = ord(ch) - 48
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def contains_card_data(text: str) -> bool:
    """Does the text contain a real (Luhn-valid) card number?"""
    if not text:
        return False
    return any(luhn_valid(m) for m in _CARD_RE.findall(text))


def strip_card_data(text: str) -> str:
    """Replace any Luhn-valid card number with `[REDACTED:card]` — the guard applied to every piece
    of caller speech before it is persisted/emitted/added to context (defense-in-depth)."""
    if not text:
        return text
    return _CARD_RE.sub(lambda m: "[REDACTED:card]" if luhn_valid(m.group(0)) else m.group(0), text)


@dataclass(frozen=True, slots=True)
class PciCaptureResult:
    """What a PCI capture provider returns — NEVER contains a PAN/CVV."""

    charge_id: str
    token: str
    last4: str
    status: str  # succeeded | failed | authorized


class PciCaptureError(RuntimeError):
    """PCI capture could not be performed (provider not configured, or a charge failure)."""


@runtime_checkable
class PciCapture(Protocol):
    """Gated PCI capture provider. `enabled` is False until a real provider is configured."""

    enabled: bool

    async def capture_and_charge(
        self, *, amount_cents: int, currency: str, description: str = ""
    ) -> PciCaptureResult: ...


class DisabledPciCapture:
    """Fallback when no PCI provider is configured — refuses clearly instead of touching card data."""

    enabled = False

    async def capture_and_charge(
        self, *, amount_cents: int, currency: str, description: str = ""
    ) -> PciCaptureResult:
        raise PciCaptureError(
            "PCI capture is not configured. Set a PCI capture provider (PCI_CAPTURE_*) to take "
            "payments on a call."
        )
