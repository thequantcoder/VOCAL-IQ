"""Call event emission.

A minimal in-process event sink for the skeleton: every lifecycle change and control
action records a `CallEvent`. The real transport (Socket.IO to dashboards + a callback
to the NestJS api) plugs into `EventSink.emit` on Day 9 — call sites don't change.
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field


@dataclass(slots=True, frozen=True)
class CallEvent:
    call_id: str
    tenant_id: str
    type: str
    data: dict[str, object] = field(default_factory=dict)
    ts: float = field(default_factory=lambda: time.time())


# A subscriber is any async callable; Day 9 registers a Socket.IO/api-callback publisher.
Subscriber = Callable[[CallEvent], Awaitable[None]]


class EventSink:
    """Records events in memory and fans them out to registered subscribers."""

    def __init__(self) -> None:
        self._log: dict[str, list[CallEvent]] = defaultdict(list)
        self._subscribers: list[Subscriber] = []

    def subscribe(self, subscriber: Subscriber) -> None:
        self._subscribers.append(subscriber)

    async def emit(self, call_id: str, tenant_id: str, type: str, **data: object) -> CallEvent:
        event = CallEvent(call_id=call_id, tenant_id=tenant_id, type=type, data=dict(data))
        self._log[call_id].append(event)
        for subscriber in self._subscribers:
            await subscriber(event)
        return event

    def history(self, call_id: str) -> list[CallEvent]:
        return list(self._log[call_id])


# Process-wide sink for the skeleton (a Redis/Socket.IO-backed one replaces it at scale).
events = EventSink()
