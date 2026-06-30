"""The voice control surface — `POST /calls/start`.

Day 08 scaffold: validates the request, opens a CallSession (QUEUED → RINGING), and
mints LiveKit join tokens when keys are configured. The live media bridge (create the
room, join the Pipecat agent, play the greeting) and the tenant-scoped Call-row write
land with the LiveKit/Deepgram/ElevenLabs keys (Day 09). Sessions are tracked in
memory here; persistence + events follow.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.calls.lifecycle import CallSession, CallStatus
from app.calls.livekit_service import mint_access_token
from app.calls.models import CallTokens, StartCallRequest, StartCallResponse
from app.config import settings

router = APIRouter(prefix="/calls", tags=["calls"])

# In-memory registry of active sessions (Redis-backed registry arrives with the loop).
_sessions: dict[str, CallSession] = {}


@router.post("/start", response_model=StartCallResponse)
async def start_call(req: StartCallRequest) -> StartCallResponse:
    """Open a call: create the session, ring it, and return join tokens.

    TODO(Day 09 live): set app.current_tenant on the DB session, persist a Call row,
    create the LiveKit room, dispatch the Pipecat agent to join + greet, emit events.
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
    session.transition(CallStatus.RINGING)
    _sessions[call_id] = session

    tokens: CallTokens | None = None
    note: str | None = None
    if settings.livekit_configured:
        assert settings.livekit_api_key and settings.livekit_api_secret  # narrowed by the property
        key, secret = settings.livekit_api_key, settings.livekit_api_secret
        tokens = CallTokens(
            participant=mint_access_token(key, secret, room, f"caller-{call_id}", name="Caller"),
            agent=mint_access_token(
                key, secret, room, f"agent-{call_id}", name="VocalIQ Agent", metadata=req.agent_id
            ),
        )
    else:
        note = "LiveKit keys not configured — tokens + media bridge pending (Day 09)."

    return StartCallResponse(call_id=call_id, room=room, status=session.status, tokens=tokens, note=note)


def active_session_count() -> int:
    """Number of in-flight sessions (used by health/shutdown)."""
    return sum(1 for s in _sessions.values() if not s.is_terminal)
