# DAY 81 — Revenue Attribution Dashboard  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 29 (leads), Day 40 (CRM integrations), Day 41 (analytics).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §3.7
- DATA-MODEL.md (Lead, Call, Campaign)

## Objective
Connect calls to actual closed revenue: attribute won deals/bookings/payments back to the agent, campaign, script, and even conversation moments — so operators see ROI, not just call metrics.

## Step-by-step build
1. Outcome tracking: tie leads → won/paid outcomes (from CRM sync, pay-by-voice, or manual); attribution model (which call/agent/campaign drove it).
2. Revenue dashboard: revenue per agent/campaign/script/voice; cost vs revenue (ROI); cohort + funnel views.
3. A/B + conversation-intelligence tie-in (what wording correlates with revenue).
4. Tests: attribution correctness, ROI math (revenue vs metered cost), dashboard accuracy, tenant scoping.

## Definition of Done
- [ ] Closed revenue attributed to agents/campaigns/scripts with ROI; dashboard accurate; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **A (attribution + ROI math) + D + B.**

## Commit plan
`feat(api,web): revenue attribution dashboard (Day 81)` — branch `day/81-revenue-attribution` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Proves the platform makes money, not just calls — the metric buyers care about most.
