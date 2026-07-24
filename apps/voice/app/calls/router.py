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

import asyncio
import hmac
import uuid

from fastapi import APIRouter, Header, HTTPException

from app.calls.events import events
from app.calls.lifecycle import CallSession, CallStatus
from app.calls.livekit_service import LiveKitRoomService, mint_access_token
from app.calls.models import (
    CallTokens,
    DispatchAgentRequest,
    DispatchAgentResponse,
    StartCallRequest,
    StartCallResponse,
)
from app.config import settings
from app.loop import livekit_agent
from app.loop.emotion import EmotionPolicy
from app.loop.engine import LoopConfig

router = APIRouter(prefix="/calls", tags=["calls"])

# In-memory registries (Redis-backed versions arrive when the loop scales out).
_sessions: dict[str, CallSession] = {}
_agent_tasks: dict[str, asyncio.Task[None]] = {}

# Default agent persona until the compiled Agent config is loaded from the api (Day 17+).
_DEFAULT_SYSTEM_PROMPT = "You are a helpful, friendly voice assistant. Keep replies short and natural."
_DEFAULT_GREETING = "Hello! Thanks for calling. How can I help you today?"


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
        agent_token = mint_access_token(
            key, secret, room, f"agent-{call_id}", name="VocalIQ Agent", metadata=req.agent_id
        )
        tokens = CallTokens(
            participant=mint_access_token(key, secret, room, f"caller-{call_id}", name="Caller"),
            agent=agent_token,
            server_url=settings.livekit_url,
        )
        # Put the AI agent in the room so the caller has someone to talk to.
        if settings.voice_ai_configured:
            _dispatch_agent(call_id, room, agent_token, req)
        else:
            note = "Voice-AI keys (Deepgram/OpenAI/ElevenLabs) not set — room ready, no agent dispatched."
    else:
        note = "LiveKit keys not configured — room + tokens + media bridge pending."

    session.transition(CallStatus.RINGING)
    await events.emit(call_id, req.tenant_id, "call.ringing", room=room, media=tokens is not None)

    return StartCallResponse(
        call_id=call_id, room=room, status=session.status, tokens=tokens, note=note
    )


def _dispatch_agent(call_id: str, room: str, agent_token: str, req: StartCallRequest) -> None:
    """Launch the conversation-loop agent worker to join the room (background task)."""
    config = LoopConfig(
        tenant_id=req.tenant_id,
        call_id=call_id,
        agent_id=req.agent_id,
        system_prompt=_DEFAULT_SYSTEM_PROMPT,
        greeting=_DEFAULT_GREETING,
        # Day 77: activate emotion-aware voice when the caller supplied the agent's policy.
        emotion_policy=(
            EmotionPolicy.from_dict(req.emotion_policy) if req.emotion_policy is not None else None
        ),
    )
    _run_agent_in_room(call_id, agent_token, config)


def _run_agent_in_room(call_id: str, agent_token: str, config: LoopConfig) -> None:
    """Join the agent to an already-created room + run the loop as a background task. Shared by
    /start (fresh room) and /dispatch (the web widget's existing room)."""
    assert settings.livekit_url and settings.deepgram_api_key
    assert settings.openai_api_key and settings.elevenlabs_api_key
    task = asyncio.create_task(
        livekit_agent.run_agent(
            url=settings.livekit_url,
            token=agent_token,
            config=config,
            stt_key=settings.deepgram_api_key,
            llm_key=settings.openai_api_key,
            tts_key=settings.elevenlabs_api_key,
        )
    )
    _agent_tasks[call_id] = task
    task.add_done_callback(lambda _t: _agent_tasks.pop(call_id, None))


def _authorize(secret: str | None) -> None:
    """Gate (503) when the internal secret is unset; reject (401) a missing/wrong header."""
    expected = settings.voice_internal_secret
    if not expected:
        raise HTTPException(status_code=503, detail="internal control channel not configured")
    if not secret or not hmac.compare_digest(secret, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@router.post("/dispatch", response_model=DispatchAgentResponse)
async def dispatch_agent_into_room(
    body: DispatchAgentRequest, x_internal_secret: str | None = Header(default=None)
) -> DispatchAgentResponse:
    """Put the AI agent into an ALREADY-CREATED LiveKit room. The web widget mints the visitor's
    token + opens the room, then the api calls this so the agent joins the SAME room and they can
    talk. INTERNAL ONLY — `X-Internal-Secret`, constant-time compared. Fail-soft on capability:
    returns `dispatched=false` + a note when LiveKit / voice-AI keys aren't configured (the room
    stays usable), rather than erroring the caller.
    """
    _authorize(x_internal_secret)
    if not settings.livekit_configured:
        return DispatchAgentResponse(dispatched=False, note="LiveKit not configured — no agent")
    if not settings.voice_ai_configured:
        return DispatchAgentResponse(
            dispatched=False,
            note="voice-ai providers (Deepgram/OpenAI/ElevenLabs) not set — room ready, no agent",
        )
    assert settings.livekit_api_key and settings.livekit_api_secret
    agent_token = mint_access_token(
        settings.livekit_api_key,
        settings.livekit_api_secret,
        body.room,
        f"agent-{body.call_id}",
        name="VocalIQ Agent",
        metadata=body.agent_id,
    )
    config = LoopConfig(
        tenant_id=body.tenant_id,
        call_id=body.call_id,
        agent_id=body.agent_id,
        system_prompt=body.system_prompt or _DEFAULT_SYSTEM_PROMPT,
        greeting=body.greeting or _DEFAULT_GREETING,
    )
    _run_agent_in_room(body.call_id, agent_token, config)
    await events.emit(body.call_id, body.tenant_id, "agent.dispatched", room=body.room)
    return DispatchAgentResponse(dispatched=True)


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
        # Stop the agent worker for this call, if one is running.
        agent = _agent_tasks.pop(session.call_id, None)
        if agent is not None and not agent.done():
            agent.cancel()
        # IN_PROGRESS calls complete; earlier stages are cut short (FAILED) — both legal.
        terminal = CallStatus.COMPLETED if session.status is CallStatus.IN_PROGRESS else CallStatus.FAILED
        session.transition(terminal)
        if rooms is not None:
            await rooms.delete_room(session.room)
        await events.emit(
            session.call_id, session.tenant_id, "call.ended", reason="shutdown", status=terminal.value
        )
