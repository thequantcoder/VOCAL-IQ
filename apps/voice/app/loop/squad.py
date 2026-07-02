"""Multi-agent Squad runtime helpers (Day 27) — the Python mirror of the shared
`squad.ts` logic the live call loop consumes. A squad chains specialist agents inside one
call; the `ContextBus` carries captured state across handoffs so the next specialist never
re-asks, and `resolve_handoff` routes a turn's signal to the right specialist.

These are pure + deterministic (no I/O) so they are unit-tested without live providers,
exactly like `language.py`. The bus is created per call, so it only ever holds that one
call's data — there is no cross-tenant path."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class HandoffRule:
    from_agent_id: str
    on: str
    to_agent_id: str


def resolve_handoff(rules: list[HandoffRule], current_agent_id: str, signal: str) -> str | None:
    """Return the next specialist's agent id for a signal, or None to keep the turn.

    First matching rule wins (declaration order)."""
    for rule in rules:
        if rule.from_agent_id == current_agent_id and rule.on == signal:
            return rule.to_agent_id
    return None


def entry_agent(members: list[dict[str, Any]], entry_agent_id: str | None) -> str | None:
    """The specialist that answers first: explicit entry, else the lowest-`order` member."""
    if entry_agent_id:
        return entry_agent_id
    if not members:
        return None
    ordered = sorted(members, key=lambda m: m.get("order", 0))
    return ordered[0].get("agentId")


@dataclass(slots=True)
class ContextBus:
    """Per-call shared state that survives handoffs. Later specialists read what earlier
    ones captured, so nothing is re-asked."""

    _store: dict[str, Any] = field(default_factory=dict)

    def set(self, key: str, value: Any, _by_agent_id: str = "system") -> None:
        if value in (None, ""):  # never store empties
            return
        self._store[key] = value

    def merge(self, record: dict[str, Any], by_agent_id: str = "system") -> None:
        for key, value in record.items():
            self.set(key, value, by_agent_id)

    def get(self, key: str) -> Any:
        return self._store.get(key)

    def has(self, key: str) -> bool:
        return key in self._store

    def snapshot(self) -> dict[str, Any]:
        return dict(self._store)

    def for_handoff(self, to_agent_id: str) -> dict[str, Any]:
        """The handoff payload seeding the next specialist: the shared snapshot plus a
        one-line summary so the receiving agent doesn't repeat questions."""
        snap = self.snapshot()
        facts = [f"{k.replace('_', ' ')}: {v}" for k, v in snap.items()]
        summary = f"Known so far — {'; '.join(facts)}." if facts else "No details captured yet."
        return {"toAgentId": to_agent_id, "context": snap, "summary": summary}


def resolve_node_override(
    override: dict[str, Any] | None, default_model: str, default_voice_id: str | None
) -> tuple[str, str | None]:
    """Resolve the effective (model, voice) for a node: node override if set, else the
    agent default. The router meters against the RESOLVED model (self-audit D)."""
    override = override or {}
    model = (override.get("modelOverride") or "").strip() or default_model
    voice = (override.get("voiceOverride") or "").strip() or default_voice_id
    return model, voice
