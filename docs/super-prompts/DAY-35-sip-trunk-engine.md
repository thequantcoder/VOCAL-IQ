# DAY 35 — BYO-SIP Trunk Engine + 13+ Provider Templates  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- A SIP trunk to test (Twilio/Telnyx/Plivo/etc.) + credentials.
- ElevenLabs SIP and/or OpenAI Realtime SIP access if using those paths.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.3
- DATA-MODEL.md (SipTrunk)
- ARCHITECTURE.md (telephony)

## Objective
Let operators connect their own SIP trunks for inbound + outbound AI calls, with templates for 13+ carriers, dual SIP engine paths, per-plan limits, secure creds — the major margin/enterprise lever.

## Step-by-step build
1. SIP integration in the voice service (SIP.js/drachtio or LiveKit SIP): register trunk, route inbound, place outbound.
2. Provider templates with auto-filled defaults: Twilio, Plivo, Telnyx, Vonage, Bandwidth, Exotel, DIDWW, Zadarma, Cloudonix, RingCentral, Sinch, Infobip, + generic custom SIP.
3. Dual engines: ElevenLabs SIP (inbound+outbound+bulk, server recordings) + OpenAI Realtime SIP (inbound real-time + transcripts).
4. SipTrunk model: encrypted creds, TLS transport, inbound/outbound flags, concurrency limit; per-plan SIP/number/concurrency caps + KYC badge.
5. UI to add trunks, import numbers, assign agents, route calls.
6. Tests: trunk register, inbound route, outbound place, per-plan limits, creds never exposed, signature verification.

## Definition of Done
- [ ] Operators bring own SIP across 13+ templates for inbound+outbound AI calls; limits + security enforced; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (encrypted creds, TLS, webhook verify) + B + D (SIP cost path) + F.**

## Commit plan
`feat(voice,api,web): BYO-SIP trunk engine + provider templates (Day 35)` — branch `day/35-sip-trunk-engine` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Telephony cost control unlocked. Next: appointments + Google Calendar.
