# DAY 27 — Multi-Agent Squads + Shared Context Bus + Per-Node Model Swap  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 9, 21, 22.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.1
- ARCHITECTURE.md
- DATA-MODEL.md
- TECH-STACK.md (LangGraph)

## Objective
Chain specialist agents within one live call (receptionist->booking->billing) with context preserved across handoffs, invisible to the caller, plus per-node/per-stage LLM + voice swapping. Competitor-parity feature.

## Step-by-step build
1. Squad model: define a squad of agents + handoff rules; Squad-handoff node in the builder.
2. Shared context bus: conversation-state travelling across agents/nodes so nothing re-asked; tenant-scoped.
3. Orchestration via LangGraph: route turns to the right specialist; seamless audio continuity on handoff.
4. Per-node/per-stage model + voice swap (cheap for routing, premium for high-stakes) in the builder; router honours per-node overrides.
5. Tests: handoff preserves context, no caller-perceptible break, per-node selection applied + metered, context-bus tenant isolation.

## Definition of Done
- [ ] A single call hands off across specialists with shared context; per-node model swap works + metered; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (handoff) + D (per-node cost) + B (context bus scoping) + F (no handoff latency spike).**

## Commit plan
`feat(voice,web): multi-agent Squads + shared context + per-node model swap (Day 27)` — branch `day/27-squads-multiagent` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Matches/exceeds Vapi Squads. Next: campaign manager.
