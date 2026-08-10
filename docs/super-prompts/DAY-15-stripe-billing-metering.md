# DAY 15 — Stripe Subscriptions + Metered Minutes + Plan Gating  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, publishable key.
- Initial plan ladder confirmed.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md (Plan, Subscription, Wallet, Invoice)
- Blueprint §11
- Day 13 cost engine

## Objective
Monetise: subscription tiers + metered per-minute usage to Stripe, plan-based gating, invoices, proration, dunning, wallet scaffold (full reseller wallet Day 53).

## Step-by-step build
1. Create Stripe products/prices for the ladder; map to Plan rows.
2. Subscription lifecycle: checkout, upgrade/downgrade with proration, cancel, verified webhooks updating Subscription.
3. Metered usage: report minutes/units from UsageRecords to Stripe; reconcile.
4. Plan gating: included minutes, agent/number/SIP limits, feature entitlements (ties to Day 58).
5. Dunning: failed-payment retries + grace + suspend; Resend emails.
6. Wallet scaffold + low-balance alerts.
7. Tests: webhook verify + idempotency, proration math, usage reporting, limit enforcement, dunning state machine.

## Definition of Done
- [ ] User subscribes; usage metered to Stripe; limits enforced.
- [ ] Webhooks verified + idempotent; proration + dunning work.
- [ ] Invoices generated; low-balance alerts fire.
- [ ] Tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (webhook verify, no leak) + D (usage->billing accuracy) + A.**

## Commit plan
`feat(api): Stripe subscriptions, metered billing, plan gating (Day 15)` — branch `day/15-stripe-billing-metering` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Revenue path live. Next: web-call widget closes Phase 1.
