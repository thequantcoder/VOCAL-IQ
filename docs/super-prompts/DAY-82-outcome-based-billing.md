# DAY 82 — Outcome-Based Billing Option (Per Booking / Qualified Lead)  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 15 (billing), Day 53 (wallet/reconciliation), Day 81 (attribution).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §11
- DATA-MODEL.md (Plan, UsageRecord, Invoice)

## Objective
Offer pricing beyond per-minute: charge per qualified lead, per booking, or per successful outcome — with definitions, verification, and reconciliation — so resellers/tenants can sell on value.

## Step-by-step build
1. Outcome definitions: what counts (qualified lead, booking, payment) + verification rules.
2. Metering: record billable outcomes (tie to attribution Day 81) alongside minutes; configurable per plan.
3. Billing: outcome-based invoicing + wallet drawdown; reseller markup on outcomes; dispute/adjustment handling.
4. Tests: outcome detection + verification, outcome billing math, reseller margin on outcomes, disputes, tenant scoping.

## Definition of Done
- [ ] Tenants/resellers can bill per outcome (lead/booking/payment) with verification + reconciliation; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **D (billing correctness — money) + C (verification, no gaming) + B.**

## Commit plan
`feat(api): outcome-based billing (Day 82)` — branch `day/82-outcome-based-billing` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Lets resellers sell on ROI ('pay per booking') — a powerful commercial differentiator.
