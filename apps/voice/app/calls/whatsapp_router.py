"""Internal control endpoints for the WhatsApp media bridge (WAC-03) — api → voice.

The api owns signaling (it receives Meta's `calls` webhook with the caller's SDP offer and must answer
inside the ~30–60 s accept window); the voice service owns media (the aiortc peer + AI loop). These
two endpoints are that hop: `POST /calls/whatsapp/answer {call_id, sdp_offer, …} → {sdp_answer}` and
`POST /calls/whatsapp/end {call_id}`.

INTERNAL ONLY — authed with a shared secret (`X-Internal-Secret`, constant-time compared); when the
secret is unset the endpoints are DISABLED (503, gated), never open. Never expose publicly. The bridge
(aiortc) is imported lazily so this module — and its tests — don't require the native media stack.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.loop.engine import LoopConfig

router = APIRouter(prefix="/calls/whatsapp", tags=["whatsapp"])

_DEFAULT_SYSTEM_PROMPT = "You are a helpful, friendly voice assistant. Keep replies short and natural."
_DEFAULT_GREETING = "Hello! Thanks for calling. How can I help you today?"

# Lazily-built singleton so importing this module never pulls aiortc (tests + degraded boot).
_bridge: object | None = None


class WaAnswerBody(BaseModel):
    call_id: str
    sdp_offer: str
    tenant_id: str
    agent_id: str
    system_prompt: str | None = None
    greeting: str | None = None
    # WAC-11: the api only sets this once Meta GAs WhatsApp video; the bridge negotiates an m=video line
    # then. Until then it's always False (audio-only) — no negotiation against an unpublished spec.
    video: bool = False


class WaEndBody(BaseModel):
    call_id: str


class WaOfferBody(BaseModel):
    call_id: str
    tenant_id: str
    agent_id: str
    system_prompt: str | None = None
    greeting: str | None = None
    # WAC-11: GA-gated video (see WaAnswerBody.video). Audio-only until Meta ships video.
    video: bool = False


class WaApplyAnswerBody(BaseModel):
    call_id: str
    sdp_answer: str


def get_bridge() -> object:
    """Build (once) the aiortc media bridge with the configured provider keys. Lazy import so the
    control surface stays importable without the media stack; monkeypatched in unit tests."""
    global _bridge
    if _bridge is None:
        from app.telephony.whatsapp_webrtc import WhatsAppMediaBridge

        assert settings.deepgram_api_key and settings.openai_api_key and settings.elevenlabs_api_key
        _bridge = WhatsAppMediaBridge(
            stt_key=settings.deepgram_api_key,
            llm_key=settings.openai_api_key,
            tts_key=settings.elevenlabs_api_key,
        )
    return _bridge


def _authorize(secret: str | None) -> None:
    """Gate (503) when the internal secret is unset; reject (401) a missing/wrong header."""
    expected = settings.voice_internal_secret
    if not expected:
        raise HTTPException(status_code=503, detail="internal control channel not configured")
    if not secret or not hmac.compare_digest(secret, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@router.post("/answer")
async def whatsapp_answer(
    body: WaAnswerBody, x_internal_secret: str | None = Header(default=None)
) -> dict[str, str]:
    """Produce the SDP answer for a caller's offer (starts the media peer + AI loop)."""
    _authorize(x_internal_secret)
    if not settings.voice_ai_configured:
        raise HTTPException(status_code=503, detail="voice-ai providers not configured")
    config = LoopConfig(
        tenant_id=body.tenant_id,
        call_id=body.call_id,
        agent_id=body.agent_id,
        system_prompt=body.system_prompt or _DEFAULT_SYSTEM_PROMPT,
        greeting=body.greeting or _DEFAULT_GREETING,
    )
    bridge = get_bridge()
    sdp_answer = await bridge.answer(  # type: ignore[attr-defined]
        call_id=body.call_id, sdp_offer=body.sdp_offer, config=config
    )
    return {"sdp_answer": sdp_answer}


@router.post("/offer")
async def whatsapp_offer(
    body: WaOfferBody, x_internal_secret: str | None = Header(default=None)
) -> dict[str, str]:
    """Outbound (WAC-08): generate the business SDP OFFER that starts an outbound call. The api dials
    Meta with this offer; the user's answer arrives on the Connect webhook → /apply-answer."""
    _authorize(x_internal_secret)
    if not settings.voice_ai_configured:
        raise HTTPException(status_code=503, detail="voice-ai providers not configured")
    config = LoopConfig(
        tenant_id=body.tenant_id,
        call_id=body.call_id,
        agent_id=body.agent_id,
        system_prompt=body.system_prompt or _DEFAULT_SYSTEM_PROMPT,
        greeting=body.greeting or _DEFAULT_GREETING,
    )
    bridge = get_bridge()
    sdp_offer = await bridge.offer(call_id=body.call_id, config=config)  # type: ignore[attr-defined]
    return {"sdp_offer": sdp_offer}


@router.post("/apply-answer")
async def whatsapp_apply_answer(
    body: WaApplyAnswerBody, x_internal_secret: str | None = Header(default=None)
) -> dict[str, bool]:
    """Outbound (WAC-08): apply the user's SDP answer (from the Connect webhook) to the media peer."""
    _authorize(x_internal_secret)
    if _bridge is not None:
        await _bridge.apply_answer(body.call_id, body.sdp_answer)  # type: ignore[attr-defined]
    return {"ok": True}


@router.post("/end")
async def whatsapp_end(
    body: WaEndBody, x_internal_secret: str | None = Header(default=None)
) -> dict[str, bool]:
    """Tear down a call's media peer (on Terminate). Best-effort + idempotent."""
    _authorize(x_internal_secret)
    if _bridge is not None:
        await _bridge.end(body.call_id)  # type: ignore[attr-defined]
    return {"ok": True}
