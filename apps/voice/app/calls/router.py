"""The voice control surface — `POST /calls/start`.

Day 08: validates the request, opens a CallSession (QUEUED → RINGING), creates the
LiveKit room for real, mints participant + agent join tokens, and emits lifecycle
events. The Pipecat agent worker that actually JOINS the room and plays the greeting —
plus the tenant-scoped Call-row write — is the Day 09 live loop (the heaviest piece);
the room + tokens it needs are provisioned here.

Sessions are tracked in memory so health + graceful shutdown can drain and delete
their rooms. A Redis-backed registry replaces this map when the loop scales out.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from app.calls.events import events
from app.calls.lifecycle import CallSession, CallStatus
from app.calls.livekit_service import LiveKitRoomService, mint_access_token
from app.calls.models import CallTokens, StartCallRequest, StartCallResponse
from app.config import settings

router = APIRouter(prefix="/calls", tags=["calls"])

# In-memory registry of active sessions (Redis-backed registry arrives with the loop).
_sessions: dict[str, CallSession] = {}


def _room_service() -> LiveKitRoomService | None:
    """Build a room service when LiveKit is fully configured, else None (degraded mode)."""
    if not settings.livekit_configured:
        return None
    assert settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret
    return LiveKitRoomService(
        settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
    )


@router.post("/start", response_model=StartCallResponse)
async def start_call(req: StartCallRequest) -> StartCallResponse:
    """Open a call: create the session + room, ring it, and return join tokens.

    TODO(Day 09 live): set app.current_tenant on the DB session + persist a Call row,
    dispatch the Pipecat agent worker to join the room and play the greeting.
    """
    call_id = str(uuid.uuid4())
    room = f"call-{call_id}"
    session = CallSession(
        call_id=call_id,
        tenant_id=req.tenant_id,
        agent_id=req.agent_id,
        direction=req.direction,
        channel=req.channel,
        room=room,
    )
    _sessions[call_id] = session
    await events.emit(call_id, req.tenant_id, "call.queued", agent_id=req.agent_id, room=room)

    rooms = _room_service()
    tokens: CallTokens | None = None
    note: str | None = None

    if rooms is not None:
        assert settings.livekit_api_key and settings.livekit_api_secret
        key, secret = settings.livekit_api_key, settings.livekit_api_secret
        try:
            await rooms.create_room(room)
        except Exception as exc:  # provider/transport failure — fail the call cleanly
            session.transition(CallStatus.FAILED)
            await events.emit(call_id, req.tenant_id, "call.failed", reason="room_create_failed")
            raise HTTPException(status_code=502, detail="Failed to provision media room") from exc
        tokens = CallTokens(
            participant=mint_access_token(key, secret, room, f"caller-{call_id}", name="Caller"),
            agent=mint_access_token(
                key, secret, room, f"agent-{call_id}", name="VocalIQ Agent", metadata=req.agent_id
            ),
            server_url=settings.livekit_url,
        )
    else:
        note = "LiveKit keys not configured — room + tokens + media bridge pending (Day 09)."

    session.transition(CallStatus.RINGING)
    await events.emit(call_id, req.tenant_id, "call.ringing", room=room, media=tokens is not None)

    return StartCallResponse(
        call_id=call_id, room=room, status=session.status, tokens=tokens, note=note
    )


def active_session_count() -> int:
    """Number of in-flight sessions (used by health/shutdown)."""
    return sum(1 for s in _sessions.values() if not s.is_terminal)


async def drain_active_calls() -> None:
    """Graceful shutdown: end in-flight sessions (via legal terminal transitions) and
    delete their LiveKit rooms so the provider isn't left with orphaned rooms."""
    rooms = _room_service()
    for session in list(_sessions.values()):
        if session.is_terminal:
            continue
        # IN_PROGRESS calls complete; earlier stages are cut short (FAILED) — both legal.
        terminal = CallStatus.COMPLETED if session.status is CallStatus.IN_PROGRESS else CallStatus.FAILED
        session.transition(terminal)
        if rooms is not None:
            await rooms.delete_room(session.room)
        await events.emit(
            session.call_id, session.tenant_id, "call.ended", reason="shutdown", status=terminal.value
        )
