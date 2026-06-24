# DAY 37 — Google Sheets Live Sync + Form Builder  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Google OAuth (Sheets scope).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.6
- DATA-MODEL.md

## Objective
Import lead lists from Sheets + push calls/appointments/form submissions back in real time (auto header creation), plus a form builder whose submissions trigger calls/automations and route to webhooks/Sheets.

## Step-by-step build
1. Sheets connect (OAuth) + picker; import contacts; live push of calls/appointments/forms with auto header-row creation.
2. Form builder: fields, validation; submissions create contacts/leads + trigger calls/automations; route by form/node id to webhook/Sheets.
3. Tests: import/sync, header creation, form submission -> trigger, routing.

## Definition of Done
- [ ] Sheets two-way sync + form builder with routing; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (OAuth scopes, sanitisation) + B + A.**

## Commit plan
`feat(api,web): Google Sheets sync + form builder (Day 37)` — branch `day/37-sheets-forms` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Workspace integrations done. Next: cost/reliability protection.
