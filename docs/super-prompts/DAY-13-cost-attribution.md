# DAY 13 — Cost Attribution Engine + UsageRecord Pipeline  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 7-12; provider price tables confirmed (re-check rates).
- No new credentials.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md (golden rule #4)
- DATA-MODEL.md (UsageRecord, Call.costBreakdown)
- ARCHITECTURE.md
- Blueprint §11

## Objective
Turn per-call UsageRecords (STT+LLM+TTS+telephony) into authoritative, queryable cost — per call/agent/tenant — feeding dashboards + reseller margin. No calling path exists without it.

## Step-by-step build
1. Aggregate UsageRecords per call into Call.costBreakdown {stt,llm,tts,telephony,total} live + on end.
2. Versioned provider price table (rate changes don't corrupt history); consistent costUsd.
3. Roll up usage into Timescale hypertables for fast per-tenant/agent/day aggregation.
4. Cost APIs: per-call detail, per-agent/tenant rollups, date ranges.
5. BYOK cost=0-to-tenant (informational) vs managed (billable).
6. Reconciliation job (workers) catches any unmetered call + alarms.
7. Tests: aggregation, BYOK vs managed, price-table versioning, rollup accuracy, no-unmetered-call invariant.

## Definition of Done
- [ ] Every call shows accurate cost breakdown.
- [ ] Per-agent/tenant rollups fast (Timescale).
- [ ] BYOK vs managed handled; reconciliation finds zero unmetered.
- [ ] Tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (the point) + F (rollups) + B. Add a fake unmetered call in a test; confirm reconciliation flags it.**

## Commit plan
`feat(api,workers): cost attribution engine + usage rollups (Day 13)` — branch `day/13-cost-attribution` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Unit economics visible per call. Next: first usable dashboard.
