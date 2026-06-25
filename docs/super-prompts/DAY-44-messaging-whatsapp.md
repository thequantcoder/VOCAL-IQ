# DAY 44 — Multi-Channel Messaging — WhatsApp/SMS Follow-ups + Blended Campaigns  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- WhatsApp Cloud API (WHATSAPP_*) and/or Twilio SMS; templates approved.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.4
- DATA-MODEL.md (Campaign.channelMix)

## Objective
Add messaging: templated WhatsApp/SMS post-call follow-ups (confirmations, links, reminders) with variable substitution + per-language templates, and blended voice+text campaigns (call, then text no-answers).

## Step-by-step build
1. WhatsApp Cloud API + Twilio SMS adapters (messaging abstraction mirroring the router); webhook verification for inbound/status.
2. Template management: variables, per-language, approval status; send on post-call triggers + automations.
3. Blended campaigns: channelMix (call -> text fallback); per-channel cost metered.
4. Tests: send + template substitution, webhook verification, blended logic, cost metering, opt-out handling.

## Definition of Done
- [ ] WhatsApp/SMS follow-ups + blended campaigns; opt-out + cost handled; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (webhook verify, opt-out/compliance) + D + B.**

## Commit plan
`feat(api,workers,web): WhatsApp/SMS messaging + blended campaigns (Day 44)` — branch `day/44-messaging-whatsapp` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Multi-channel live. Next: multimodality.
