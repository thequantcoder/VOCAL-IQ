# DAY 11 — Inbound Answering + Number Assignment + Concurrency  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- A Twilio number pointed at the platform webhook (Claude gives URL).
- Public dev URL (tunnel) or staging.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md
- DATA-MODEL.md (PhoneNumber, Call)
- Day 9 loop

## Objective
Answer inbound PSTN calls: route a call on a tenant's number to its agent, run the loop, handle queueing/concurrency, verify webhook security.

## Step-by-step build
1. Inbound webhook (Twilio voice) with signature verification + replay protection; resolve tenant + agent from called number.
2. Bridge inbound into the loop; greet + converse.
3. Number management: assign agent to PhoneNumber; per-plan number + concurrency limits.
4. Queueing when saturated; graceful fallback message.
5. Tests: webhook verification, number->tenant/agent resolution, concurrency cap + queue, full inbound flow.

## Definition of Done
- [ ] Calling a tenant's number reaches its agent.
- [ ] Webhook verified; tenant/agent resolved.
- [ ] Concurrency + queueing enforced; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (webhook verify) + B (number->tenant) + F.**

## Commit plan
`feat(voice,api): inbound answering, number assignment, concurrency (Day 11)` — branch `day/11-inbound-answering` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Inbound + outbound live. Next: recording + transcription.
