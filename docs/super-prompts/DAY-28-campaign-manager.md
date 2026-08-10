# DAY 28 — Campaign Manager — Lists, CSV Import, Scheduling, Pacing, Retries  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 10 outbound; workers running.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md (Campaign, CampaignContact, Contact)
- ARCHITECTURE.md
- CODING-RULES.md

## Objective
Build, schedule, monitor outbound campaigns at scale: CSV/contact import, timezone-aware scheduling, pacing/concurrency caps, retries, DNC/suppression, live monitoring.

## Step-by-step build
1. Campaign CRUD + contact import (CSV/paste) with field mapping + dedupe + DNC suppression.
2. Scheduler (BullMQ): timezone-aware windows, daily caps, pacing, concurrency limits; best-time heuristics.
3. Retry management (attempts, backoff, on no-answer/busy).
4. Live monitor: pending/processing/completed/failed counts, real-time.
5. Tests: import + dedupe + DNC, scheduling/timezones, pacing/concurrency caps, retry state machine.

## Definition of Done
- [ ] Campaigns import, schedule, pace, retry, report live; DNC enforced; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (DNC, caps, abuse) + B + F (pacing under load) + D.**

## Commit plan
`feat(api,workers,web): campaign manager (Day 28)` — branch `day/28-campaign-manager` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Bulk outreach live. Next: lead workspace + scoring.
