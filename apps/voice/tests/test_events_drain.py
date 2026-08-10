"""Event sink + graceful-shutdown drain (Day 08)."""

from __future__ import annotations

import pytest

from app.calls import router as calls_router
from app.calls.events import EventSink
from app.calls.lifecycle import CallSession, CallStatus
from app.calls.livekit_service import LiveKitRoomService


async def test_event_sink_records_and_fans_out_to_subscribers() -> None:
    from app.calls.events import CallEvent

    sink = EventSink()
    received: list[CallEvent] = []

    async def collector(e: CallEvent) -> None:
        received.append(e)

    sink.subscribe(collector)
    await sink.emit("c1", "t1", "call.queued", room="call-c1")

    history = sink.history("c1")
    assert len(history) == 1
    assert history[0].type == "call.queued"
    assert history[0].data == {"room": "call-c1"}
    assert received[-1].call_id == "c1"


@pytest.fixture(autouse=True)
def _clear_sessions():
    calls_router._sessions.clear()
    yield
    calls_router._sessions.clear()


async def test_drain_completes_in_progress_and_fails_earlier_stages(monkeypatch) -> None:
    deleted: list[str] = []

    async def fake_delete(self: LiveKitRoomService, name: str) -> None:
        deleted.append(name)

    monkeypatch.setattr(LiveKitRoomService, "delete_room", fake_delete)
    # Configure LiveKit so the drain builds a room service.
    from app.config import settings

    monkeypatch.setattr(settings, "livekit_url", "wss://x.livekit.cloud")
    monkeypatch.setattr(settings, "livekit_api_key", "k")
    monkeypatch.setattr(settings, "livekit_api_secret", "s")

    # One IN_PROGRESS call (→ COMPLETED) and one RINGING call (→ FAILED).
    live = CallSession("c-live", "t1", "a1", "OUTBOUND", "WEB", "call-c-live")
    live.transition(CallStatus.RINGING)
    live.transition(CallStatus.IN_PROGRESS)
    ringing = CallSession("c-ring", "t1", "a1", "OUTBOUND", "WEB", "call-c-ring")
    ringing.transition(CallStatus.RINGING)
    calls_router._sessions["c-live"] = live
    calls_router._sessions["c-ring"] = ringing

    await calls_router.drain_active_calls()

    assert live.status is CallStatus.COMPLETED
    assert ringing.status is CallStatus.FAILED
    assert sorted(deleted) == ["call-c-live", "call-c-ring"]
    assert calls_router.active_session_count() == 0
