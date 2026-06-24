# DAY 08 — Voice Service Skeleton — FastAPI + LiveKit Room + Media Bridge  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- LiveKit keys; Day 7 mirror.
- apps/voice runs locally (docker LiveKit up).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md (live call flow, services)
- TECH-STACK.md (voice)
- DATA-MODEL.md (Call)

## Objective
Build the voice control surface: FastAPI that on request from api creates a LiveKit room, mints tokens, joins a Pipecat agent worker, bridges media — proving an agent can join a call and hear/emit audio (full loop Day 9).

## Step-by-step build
1. FastAPI POST /calls/start (tenant, agentId, flowVersion, leadContext, channel) + /healthz; set app.current_tenant on its DB session per call.
2. LiveKit: create room, mint participant + agent tokens, spin a Pipecat agent that joins.
3. Media bridge: agent receives caller audio + plays a placeholder TTS greeting (router TTS).
4. Create Call row at start; lifecycle QUEUED->RINGING->IN_PROGRESS.
5. Emit basic events to api/clients via callback/Socket.IO.
6. Tests: room creation, token minting, agent join, greeting playback, lifecycle.

## Definition of Done
- [ ] /calls/start creates room, joins agent, plays greeting; Call row tracks status.
- [ ] Tenant set on voice session; events emitted.
- [ ] Health + graceful shutdown; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (tenant on voice session) + F (no blocking async) + G (clean shutdown).**

## Commit plan
`feat(voice): FastAPI control surface, LiveKit room, agent join, greeting (Day 8)` — branch `day/08-voice-service-skeleton` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Agent joins calls. Next: full real-time loop (heaviest).
