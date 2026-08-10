# DAY 49 — SaaS Ops Toolkit — Tickets, Credits, Number Pool/KYC, Notifications, Trials  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Stripe (Day 15); number provisioning (Days 10-11).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.7
- DATA-MODEL.md (SupportTicket, Wallet, PhoneNumber, Notification)

## Objective
Operator tooling: in-platform support ticketing, credit/bonus-credit billing, phone-number pool + purchasing + KYC badges + per-plan limits, broadcast + per-event notifications, configurable trial limits.

## Step-by-step build
1. Support ticketing: create/assign/status; per-tenant; for resellers to support customers.
2. Credit system: prepaid + bonus credits + membership perks; drain on usage; low-balance alerts (ties to wallet).
3. Phone-number pool: admin pool + purchasing + assignment + KYC badge + per-plan limits.
4. Notifications: in-app/email/SMS/webhook for events; super-admin broadcast.
5. Configurable trial limits (agents/calls/days).
6. Tests: ticket lifecycle, credit drain + bonus, number assignment + limits, notification dispatch, trial enforcement.

## Definition of Done
- [ ] Tickets, credits, number pool/KYC, notifications, trials work; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B + D (credits) + C (KYC).**

## Commit plan
`feat(api,web): SaaS ops toolkit (Day 49)` — branch `day/49-saas-ops-toolkit` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Operators self-sufficient. Next: onboarding + motion polish.
