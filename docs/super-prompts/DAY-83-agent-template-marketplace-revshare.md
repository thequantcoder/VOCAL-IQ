# DAY 83 — Agent Template Marketplace with Revenue Share  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 24 (templates), Day 53 (payments/wallet), Day 56 (plans).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §3.4, §8
- DATA-MODEL.md

## Objective
A marketplace where creators publish agent templates (and flows/voices/prompt packs) for others to buy/clone, with revenue share to creators and a platform cut — an ecosystem flywheel.

## Step-by-step build
1. Publishing: creators list templates (pricing, description, preview); review/approval; versioning.
2. Purchase/clone: buyers acquire + clone into their tenant; licensing rules; ratings/reviews.
3. Revenue share: creator payout + platform cut via the billing/wallet engine; payout ledger.
4. Tests: publish/approve flow, purchase + clone isolation, rev-share math + payouts, ratings, tenant scoping.

## Definition of Done
- [ ] Creators publish + monetise templates; buyers clone; rev-share + payouts work; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **D (rev-share/payout correctness) + B (template isolation) + C (review/approval).**

## Commit plan
`feat(api,web): agent template marketplace + revenue share (Day 83)` — branch `day/83-agent-template-marketplace-revshare` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Ecosystem flywheel — creators bring content + users; platform earns a cut.
