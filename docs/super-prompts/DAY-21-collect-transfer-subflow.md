# DAY 21 — Collect&Confirm, Transfer & Sub-flow Nodes  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 18-20; human transfer target (Agent Desk) — stub if needed.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.4
- DATA-MODEL.md

## Objective
Add Collect&Confirm (read back + confirm), Transfer/Handoff (human or another agent), reusable Sub-flow nodes.

## Step-by-step build
1. Collect&Confirm: summarise captured fields, confirm/correct loop before acting.
2. Transfer: warm/cold to a human (spoken context summary) or another agent (prep Squads Day 27).
3. Sub-flow: reusable mini-graph callable from any agent (e.g. verify identity).
4. Tests: confirm/correct loop, transfer context passing, sub-flow invocation + return.

## Definition of Done
- [ ] Three nodes work + tested; sub-flows reusable.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A + B (transfer carries context without cross-tenant leak).**

## Commit plan
`feat(web,voice): collect/confirm, transfer, sub-flow nodes (Day 21)` — branch `day/21-collect-transfer-subflow` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Full node set nearly done. Next: flow compiler.
