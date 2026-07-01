"""Twilio outbound dialer.

`build_call_params` is a pure builder for the Twilio `calls.create` request (incl. async
AMD + status callbacks) — fully testable offline. `TwilioOutboundDialer.dial` runs the
(blocking) Twilio SDK call in a thread so it never stalls the event loop. The `url`
points at the platform endpoint that returns the TwiML bridging the call into the
caller's LiveKit room; that bridge + the funded number are the live piece (memory:
twilio-live-test-pending). The client is a narrow Protocol so tests inject a fake.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode


@dataclass(slots=True)
class OutboundCall:
    call_id: str
    to: str  # E.164 (already gate-checked by the api)
    room: str  # the LiveKit room the answered call bridges into


@dataclass(slots=True)
class TwilioDialResult:
    call_id: str
    sid: str
    status: str


class _CreatedCall(Protocol):
    sid: str
    status: str


class _Calls(Protocol):
    def create(self, **kwargs: object) -> _CreatedCall: ...


class TwilioClientLike(Protocol):
    """The slice of twilio.rest.Client we use (real client is duck-compatible)."""

    calls: _Calls


def build_call_params(
    call: OutboundCall,
    *,
    from_number: str,
    bridge_url: str,
    status_callback_url: str,
    amd_callback_url: str | None = None,
    machine_detection: bool = True,
) -> dict[str, object]:
    """Build the Twilio `calls.create` kwargs for one outbound call."""
    query = urlencode({"call_id": call.call_id, "room": call.room})
    params: dict[str, object] = {
        "to": call.to,
        "from_": from_number,
        # TwiML that bridges the answered call into the LiveKit room (served by the platform).
        "url": f"{bridge_url}?{query}",
        "method": "POST",
        "status_callback": f"{status_callback_url}?{urlencode({'call_id': call.call_id})}",
        "status_callback_event": ["initiated", "ringing", "answered", "completed"],
        "status_callback_method": "POST",
    }
    if machine_detection:
        # Async AMD: the call proceeds while Twilio classifies; the result arrives on the
        # AMD callback, which drives decide_on_answer() (human → agent, machine → policy).
        params["machine_detection"] = "DetectMessageEnd"
        params["async_amd"] = "true"
        params["async_amd_status_callback_method"] = "POST"
        if amd_callback_url is not None:
            params["async_amd_status_callback"] = (
                f"{amd_callback_url}?{urlencode({'call_id': call.call_id})}"
            )
    return params


class TwilioOutboundDialer:
    def __init__(
        self,
        client: TwilioClientLike,
        *,
        from_number: str,
        bridge_url: str,
        status_callback_url: str,
        amd_callback_url: str | None = None,
        machine_detection: bool = True,
    ) -> None:
        self._client = client
        self._from_number = from_number
        self._bridge_url = bridge_url
        self._status_callback_url = status_callback_url
        self._amd_callback_url = amd_callback_url
        self._machine_detection = machine_detection

    async def dial(self, call: OutboundCall) -> TwilioDialResult:
        params = build_call_params(
            call,
            from_number=self._from_number,
            bridge_url=self._bridge_url,
            status_callback_url=self._status_callback_url,
            amd_callback_url=self._amd_callback_url,
            machine_detection=self._machine_detection,
        )
        # Twilio's SDK call is blocking HTTP — keep it off the event loop.
        created = await asyncio.to_thread(lambda: self._client.calls.create(**params))
        return TwilioDialResult(call_id=call.call_id, sid=created.sid, status=created.status)
