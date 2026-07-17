"""Pure SDP helpers for the WhatsApp media bridge (WAC-03) — no aiortc, so unit-testable anywhere.

Meta negotiates OPUS at 48 kHz (rtpmap `opus/48000/2`). Before answering we confirm the caller's
offer actually carries OPUS and find its dynamic payload type (typically 111) — a sanity gate so a
malformed / codec-mismatched offer fails fast instead of producing a dead media leg.
"""

from __future__ import annotations

import re

_OPUS_RTPMAP = re.compile(r"^a=rtpmap:(\d+)\s+opus/48000", re.IGNORECASE | re.MULTILINE)
_TELEPHONE_EVENT = re.compile(r"^a=rtpmap:(\d+)\s+telephone-event/(\d+)", re.IGNORECASE | re.MULTILINE)


def opus_payload_type(sdp: str) -> int | None:
    """The OPUS/48000 dynamic payload type in an SDP, or None if the offer has no OPUS line."""
    m = _OPUS_RTPMAP.search(sdp or "")
    return int(m.group(1)) if m else None


def sdp_has_opus(sdp: str) -> bool:
    """True when the SDP offers OPUS at 48 kHz (the required primary codec)."""
    return opus_payload_type(sdp) is not None


def telephone_event_payload_type(sdp: str, clock: int = 8000) -> int | None:
    """The RFC 4733 telephone-event (DTMF) payload type at the given clock (8 kHz per Meta), if any."""
    for m in _TELEPHONE_EVENT.finditer(sdp or ""):
        if int(m.group(2)) == clock:
            return int(m.group(1))
    return None
