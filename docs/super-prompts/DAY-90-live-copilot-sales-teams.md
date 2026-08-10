# DAY 90 — Live Call Co-Pilot for Human Sales Teams  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 74 (whisper), Day 75 (conv. intelligence), Day 67 (Agent Desk).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §5.2
- DATA-MODEL.md

## Objective
A standalone co-pilot product: AI listens to human-led sales calls (even outside the AI-agent flow) and assists live — battlecards, objection handling, CRM auto-fill, next steps — expanding the addressable market to human teams.

## Step-by-step build
1. Co-pilot session: join a human's live call (web/SIP), real-time transcription + suggestions + battlecards + competitor handling.
2. Auto CRM notes + next-step suggestions post-call.
3. Works as a light-touch product for teams not ready for full AI agents (land-and-expand).
4. Tests: live assist, suggestion relevance, CRM auto-fill, never-spoken-to-caller, tenant scoping.

## Definition of Done
- [ ] Human sales teams get a live AI co-pilot on their own calls with CRM auto-fill; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **B + C (privacy, copilot not audible to caller) + F.**

## Commit plan
`feat(web,voice): live call co-pilot for human teams (Day 90)` — branch `day/90-live-copilot-sales-teams` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Expands TAM to human sales teams — a wedge product that upsells into full AI agents.
