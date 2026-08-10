"""Call lifecycle state machine — mirrors the shared `CallStatus` enum and DATA-MODEL.

A `CallSession` is the in-memory control object for one live call. Transitions are
validated (illegal jumps raise) so the call status can never go backwards or skip
a stage; terminal states are final. The Call DB row (Prisma) is written by the
control plane at start/end (wired Day 09)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class CallStatus(str, Enum):
    QUEUED = "QUEUED"
    RINGING = "RINGING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    VOICEMAIL = "VOICEMAIL"
    NO_ANSWER = "NO_ANSWER"


CallDirection = Literal["INBOUND", "OUTBOUND"]
CallChannel = Literal["PSTN", "WEB", "SIP"]

TERMINAL_STATUSES: frozenset[CallStatus] = frozenset(
    {CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.VOICEMAIL, CallStatus.NO_ANSWER}
)

# Allowed forward transitions; anything else is rejected.
_ALLOWED: dict[CallStatus, frozenset[CallStatus]] = {
    CallStatus.QUEUED: frozenset({CallStatus.RINGING, CallStatus.FAILED}),
    CallStatus.RINGING: frozenset(
        {CallStatus.IN_PROGRESS, CallStatus.NO_ANSWER, CallStatus.VOICEMAIL, CallStatus.FAILED}
    ),
    CallStatus.IN_PROGRESS: frozenset({CallStatus.COMPLETED, CallStatus.FAILED}),
}


class InvalidTransitionError(ValueError):
    """Raised when a call is asked to move to a state it cannot reach from its current one."""


@dataclass(slots=True)
class CallSession:
    call_id: str
    tenant_id: str
    agent_id: str
    direction: CallDirection
    channel: CallChannel
    room: str
    status: CallStatus = CallStatus.QUEUED
    history: list[CallStatus] = field(default_factory=lambda: [CallStatus.QUEUED])

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    def can_transition(self, to: CallStatus) -> bool:
        return to in _ALLOWED.get(self.status, frozenset())

    def transition(self, to: CallStatus) -> None:
        """Advance the call to `to`, or raise InvalidTransitionError. Tenant-scoped
        side-effects (DB update, event emit) are applied by the caller after this."""
        if not self.can_transition(to):
            raise InvalidTransitionError(f"{self.status.value} -> {to.value} is not allowed")
        self.status = to
        self.history.append(to)
