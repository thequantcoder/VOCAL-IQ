# DAY 74 — AI Coaching / Whisper for Human Agents  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 67 (Agent Desk), Day 20 (RAG).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §5.2 (assist mode)
- DATA-MODEL.md

## Objective
A real-time AI copilot for human agents on the Agent Desk: live suggestions, KB answers, objection-handling prompts, and next-best-action — visible to the agent, never spoken to the caller.

## Step-by-step build
1. Real-time assist sidebar: AI listens to the live human call + suggests responses, surfaces KB answers, flags compliance reminders.
2. Objection/intent detection feeding suggestions; next-best-action recommendations.
3. Post-call auto-notes + disposition draft for the human to confirm.
4. Tests: suggestion relevance (mocked), KB surfacing, never-spoken-to-caller guarantee, latency, tenant scoping.

## Definition of Done
- [ ] Human agents get live AI suggestions + KB answers + auto-notes during calls; copilot never speaks to caller; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **B + C (copilot output not leaked to caller) + F.**

## Commit plan
`feat(web,voice): AI coaching/whisper copilot for human agents (Day 74)` — branch `day/74-ai-coaching-whisper` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Makes human agents dramatically more effective — strong for hybrid AI+human teams.
