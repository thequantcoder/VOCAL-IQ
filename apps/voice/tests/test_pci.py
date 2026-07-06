"""Day 78 — PCI-safe pay-by-voice primitives (card detection + gated capture seam).

The card detector must catch real (Luhn-valid) PANs and ignore ordinary long numbers, and the
disabled capture seam must refuse clearly rather than ever touch card data.
"""

from __future__ import annotations

import pytest

from app.loop.pci import (
    DisabledPciCapture,
    PciCaptureError,
    contains_card_data,
    luhn_valid,
    strip_card_data,
)

CARD = "4242 4242 4242 4242"  # Luhn-valid Visa test PAN
NOT_CARD = "1234 5678 9012 3456"  # fails Luhn


def test_luhn_valid() -> None:
    assert luhn_valid(CARD)
    assert not luhn_valid(NOT_CARD)
    assert not luhn_valid("4242")  # too short


def test_contains_card_data() -> None:
    assert contains_card_data(f"my card is {CARD}")
    assert not contains_card_data(f"order number {NOT_CARD}")
    assert not contains_card_data("I'd like to pay 4200 dollars")
    assert not contains_card_data("")


def test_strip_card_data_redacts_only_cards() -> None:
    out = strip_card_data(f"pay with {CARD} thanks")
    assert "4242" not in out
    assert "[REDACTED:card]" in out
    assert out.startswith("pay with")
    assert out.endswith("thanks")
    # A non-card long number is left alone.
    assert strip_card_data(f"ref {NOT_CARD}") == f"ref {NOT_CARD}"


def test_strip_handles_dashed_and_spaced_cards() -> None:
    assert "[REDACTED:card]" in strip_card_data("4242-4242-4242-4242")
    assert "[REDACTED:card]" in strip_card_data("card 4242424242424242 end")


async def test_disabled_pci_capture_refuses_clearly() -> None:
    with pytest.raises(PciCaptureError, match="not configured"):
        await DisabledPciCapture().capture_and_charge(amount_cents=1999, currency="USD")
