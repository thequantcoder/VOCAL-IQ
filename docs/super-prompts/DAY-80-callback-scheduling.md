# DAY 80 — Call-Back Scheduling (Caller-Requested Callbacks)  ⚡ SONNET

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 28 (campaigns), Day 36 (scheduling/calendar).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §3.6
- DATA-MODEL.md (Appointment, Campaign)

## Objective
Let callers (or no-answers) request a callback at a chosen time; the system schedules + auto-dials at that time, respecting timezones + calling rules.

## Step-by-step build
1. Callback node/flow: agent offers + captures a preferred callback time; store it.
2. Scheduler auto-dials at the requested time (timezone + calling-hour aware); retry if missed.
3. Inbound callback requests via IVR/keyword too.
4. Tests: scheduling, timezone correctness, auto-dial trigger, calling-rule compliance, tenant scoping.

## Definition of Done
- [ ] Callers schedule callbacks; system auto-dials on time within rules; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **A (timezone/scheduling) + C (calling rules) + B.**

## Commit plan
`feat(api,workers,voice): caller-requested callback scheduling (Day 80)` — branch `day/80-callback-scheduling` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Higher connect + conversion — call people when they actually want it.
