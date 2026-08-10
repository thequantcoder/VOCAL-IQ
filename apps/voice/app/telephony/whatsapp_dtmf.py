"""RFC 4733 telephone-event (DTMF) decoding for WhatsApp calls (WAC-03) — pure, unit-testable.

WhatsApp has **no webhook for DTMF**; digits arrive inband as RFC 4733 telephone-event RTP at an
8 kHz clock. This module decodes one event payload → its digit. The bridge surfaces a digit only on
the event's **End** marker so a held key yields exactly one press (the payload repeats while held).

RFC 4733 event payload (4 bytes): [event code][E|R|volume][duration hi][duration lo].
Events 0–9 = digits, 10 = `*`, 11 = `#`, 12–15 = `A`–`D`.
"""

from __future__ import annotations

_DTMF_DIGITS = "0123456789*#ABCD"


def decode_dtmf_event(payload: bytes) -> str | None:
    """Decode a telephone-event payload → its DTMF digit, but ONLY on the End (E) bit.

    Returns None for a non-terminal packet (mid-tone repeat), a malformed payload, or an event code
    outside 0–15 — so a caller can safely feed every telephone-event packet and get one digit per press.
    """
    if len(payload) < 4:
        return None
    event = payload[0]
    end_of_event = bool(payload[1] & 0x80)  # the 'E' bit
    if not end_of_event or event >= len(_DTMF_DIGITS):
        return None
    return _DTMF_DIGITS[event]
