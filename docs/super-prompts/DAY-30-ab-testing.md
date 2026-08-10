# DAY 30 — A/B Testing for Scripts, Voices & Openers  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 28 campaigns.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md
- Blueprint §3.6

## Objective
Test conversation variants (script/voice/opener) by splitting traffic + comparing outcomes with significance, feeding analytics.

## Step-by-step build
1. Define experiments: variants, traffic split, success metric (conversion/booking/CSAT).
2. Route campaign/inbound traffic across variants; record variant on each Call.
3. Results view: per-variant outcomes + statistical significance.
4. Tests: split assignment stability, metric aggregation, significance calc.

## Definition of Done
- [ ] A/B experiments run + compare variants with significance; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (split, stats) + B.**

## Commit plan
`feat(api,web): A/B testing (Day 30)` — branch `day/30-ab-testing` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Phase 2 complete. Tag v0.3-phase2. Next: lead intel/testing/telephony depth.
