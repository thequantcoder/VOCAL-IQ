# DAY 10 — Outbound Calling (Twilio) + Voicemail Detection  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Twilio number with voice; small test budget.
- A test phone number.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md (call flow)
- DATA-MODEL.md (Call, PhoneNumber)
- Day 9 loop

## Objective
Place real outbound PSTN calls into the live loop, with voicemail detection + optional message, full lifecycle + dispositions + cost.

## Step-by-step build
1. api POST /calls/outbound (BUILDER+): validate quota/consent/DNC, then dial via Twilio + bridge into the loop on answer.
2. AMD (answering machine detection): human -> run agent; machine -> optional leave-message (TTS) or hang up per config.
3. Handle no-answer/busy/failed; retry hooks (full retries Day 28).
4. Disposition tagging at end; persist costBreakdown.
5. Pre-call gates: DNC check, consent check, per-tenant concurrency + rate cap.
6. Tests: outbound flow (mocked Twilio), AMD branch, DNC/consent gate, disposition + cost.

## Definition of Done
- [ ] Real outbound call runs the agent.
- [ ] Voicemail detected + handled.
- [ ] DNC/consent/concurrency gates enforced; disposition + cost saved.
- [ ] Tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (abuse, consent/DNC) + D (cost) + B. Confirm concurrency cap holds.**

## Commit plan
`feat(voice,api): outbound calling + voicemail detection (Day 10)` — branch `day/10-outbound-voicemail` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Outbound live. Watch real costs; verify attribution Day 13.
