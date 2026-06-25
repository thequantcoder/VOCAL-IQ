# DAY 32 — Agent Testing Suite — Conversation Simulator / Sandbox  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 22 compiler; Day 9 loop.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.2
- ARCHITECTURE.md

## Objective
A sandbox to talk to an agent (voice or text) without real telephony, watching active node/tool calls/token+cost live — foundation for batch testing (Day 33).

## Step-by-step build
1. Simulator runtime: drive the compiled flow with synthetic or live mic/text input, no PSTN; full event stream.
2. Scriptable simulated caller (LLM-driven persona) for hands-free runs.
3. UI: transcript + active node + cost, replayable.
4. Tests: simulator drives a full conversation deterministically; event-stream correctness.

## Definition of Done
- [ ] Agents testable in a sandbox with full visibility; scriptable callers; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A + D (sim cost flagged) + B.**

## Commit plan
`feat(voice,web): conversation simulator/sandbox (Day 32)` — branch `day/32-conversation-simulator` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Foundation for QA. Next: batch testing + rubrics.
