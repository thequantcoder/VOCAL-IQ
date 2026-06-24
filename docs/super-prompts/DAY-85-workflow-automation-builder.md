# DAY 85 — Visual Workflow Automation Builder (Zapier-style)  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 47 (cross-channel automations), Day 17 (React Flow), Day 84 (apps).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §5.2.4
- DATA-MODEL.md

## Objective
A general visual automation builder (beyond call flows): triggers + conditions + actions across voice, messaging, CRM, calendar, and third-party apps — so operators automate whole business processes, not just calls.

## Step-by-step build
1. Automation canvas (React Flow): triggers (call/lead/appointment/webhook/schedule) → conditions/branches → actions (call, message, CRM, ticket, app action, delay, loop).
2. Execution engine (workers): durable, retryable, observable runs; run history + logs.
3. Templates + marketplace tie-in.
4. Tests: trigger→action execution, branching/delays, durability/retry, observability, tenant scoping.

## Definition of Done
- [ ] Operators build multi-step cross-system automations visually; durable + observable execution; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **A (execution correctness/durability) + C (action authz) + B + F.**

## Commit plan
`feat(web,workers): visual workflow automation builder (Day 85)` — branch `day/85-workflow-automation-builder` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Expands from 'voice agents' to a business-automation platform — bigger TAM.
