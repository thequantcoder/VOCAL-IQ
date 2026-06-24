# DAY 36 — Appointments Module + Google Calendar 2-Way Sync  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Google Cloud OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET); consent screen configured.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.6
- DATA-MODEL.md (Appointment)

## Objective
Agents book real appointments into connected calendars with conflict checking + confirmation, plus an appointments module (status tabs, stat cards) and two-way Google Calendar sync.

## Step-by-step build
1. Google OAuth 2.0 connect; store tokens (encrypted) + refresh.
2. Booking node/action: check availability, book/reschedule/cancel/complete; conflict check + confirmation read-back.
3. Two-way sync: create/update/delete/cancel both ways; webhook/poll.
4. Appointments UI: status tabs + stat cards.
5. Tests: OAuth flow, booking + conflict, two-way sync events, tenant scoping.

## Definition of Done
- [ ] Agents book/reschedule/cancel real events with two-way sync; appointments UI; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (OAuth tokens encrypted) + B + A (conflict).**

## Commit plan
`feat(api,web): appointments + Google Calendar two-way sync (Day 36)` — branch `day/36-appointments-gcal` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Booking live. Next: Sheets sync + form builder.
