"""Request/response models for the call control surface (Pydantic v2 — validate at the
boundary, CODING-RULES §2)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.calls.lifecycle import CallChannel, CallDirection, CallStatus


class StartCallRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
    agent_id: str = Field(min_length=1)
    flow_version_id: str | None = None
    direction: CallDirection = "OUTBOUND"
    channel: CallChannel = "WEB"
    # Arbitrary per-call context (lead fields, dynamic vars) — passed to the agent.
    lead_context: dict[str, object] = Field(default_factory=dict)
    # Day 77: the agent's emotion-aware voice policy (Agent.emotionPolicy JSON). The caller fetches it
    # (GET /agents/{id}/emotion-policy) and includes it so modulation activates with no DB round-trip
    # in the voice app (self-audit F). Absent/None ⇒ neutral voice.
    emotion_policy: dict[str, object] | None = None


class CallTokens(BaseModel):
    participant: str
    agent: str
    # The ws(s):// URL clients dial to join the room (set when LiveKit is configured).
    server_url: str | None = None


class StartCallResponse(BaseModel):
    call_id: str
    room: str
    status: CallStatus
    tokens: CallTokens | None = None
    # Set when something is pending (e.g. LiveKit keys not configured yet).
    note: str | None = None
