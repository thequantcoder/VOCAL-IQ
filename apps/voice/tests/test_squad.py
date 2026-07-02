"""Multi-agent Squad runtime: handoff routing + shared context bus + per-node override
(Day 27). Pure/deterministic, mirrors the shared squad.ts tests."""

from __future__ import annotations

from app.loop.squad import (
    ContextBus,
    HandoffRule,
    entry_agent,
    resolve_handoff,
    resolve_node_override,
)

A = "agent-a"
B = "agent-b"
C = "agent-c"

RULES = [
    HandoffRule(from_agent_id=A, on="booking", to_agent_id=B),
    HandoffRule(from_agent_id=B, on="billing", to_agent_id=C),
]


def test_resolve_handoff_routes_and_falls_through() -> None:
    assert resolve_handoff(RULES, A, "booking") == B
    assert resolve_handoff(RULES, B, "billing") == C
    assert resolve_handoff(RULES, A, "billing") is None  # no rule → keep the turn
    assert resolve_handoff(RULES, C, "booking") is None


def test_context_bus_preserves_state_across_handoffs() -> None:
    bus = ContextBus()
    bus.merge({"caller_name": "Ada", "reason": "appointment"}, A)
    bus.set("preferred_date", "2026-07-10", B)

    assert bus.snapshot() == {
        "caller_name": "Ada",
        "reason": "appointment",
        "preferred_date": "2026-07-10",
    }
    handoff = bus.for_handoff(C)
    assert handoff["toAgentId"] == C
    assert handoff["context"]["caller_name"] == "Ada"
    assert "caller name: Ada" in handoff["summary"]


def test_context_bus_ignores_empties() -> None:
    bus = ContextBus()
    bus.set("empty", "", A)
    bus.set("nil", None, A)
    assert not bus.has("empty")
    assert not bus.has("nil")


def test_entry_agent_prefers_explicit_then_lowest_order() -> None:
    members = [{"agentId": A, "order": 2}, {"agentId": B, "order": 1}]
    assert entry_agent(members, None) == B
    assert entry_agent(members, A) == A
    assert entry_agent([], None) is None


def test_resolve_node_override() -> None:
    assert resolve_node_override({"modelOverride": "gpt-4o"}, "gpt-4o-mini", "v1") == ("gpt-4o", "v1")
    assert resolve_node_override({"voiceOverride": "v2"}, "gpt-4o-mini", "v1") == ("gpt-4o-mini", "v2")
    assert resolve_node_override(None, "gpt-4o-mini", "v1") == ("gpt-4o-mini", "v1")
    assert resolve_node_override({"modelOverride": "  "}, "gpt-4o-mini", "v1") == ("gpt-4o-mini", "v1")
