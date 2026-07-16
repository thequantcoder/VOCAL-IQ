# WAC 09 — Least-cost routing (WhatsApp vs PSTN) + restriction/pickup guardrails  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- WAC-08 merged.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§D.7 (cost-smart routing), §A.11 (country block + `RESTRICTED_*`/low-pickup restrictions + `account_update` webhooks), §A.9 (pricing)**.
- WAC-01 pricing helper, WAC-06 cost, WAC-08 `canCall`; the provider-router `router.ts` (routing/selection); the existing outbound `dial`/instant-dial path (PARITY-02) + carrier adapters (Twilio/Telnyx/Plivo).
- `apps/api/src/reputation` + `abuse` (existing guardrail patterns); the `Notification`/alerts + `account_update` webhook (WAC-02).

## Objective
Make **one outbound `dial` intelligently pick the cheapest *allowed* route** — WhatsApp Calling vs PSTN/SIP — per destination + permission + country + cost, with automatic PSTN fallback; and add **guardrails** that watch pickup-rate and report/block-rate to auto-throttle WhatsApp calling *before* Meta imposes `RESTRICTED_*`.

## Step-by-step build
1. **Route selector** (in the router / dial path) — given `(tenantId, destination, agent, intent)` produce an ordered route plan:
   - Prefer **WhatsApp** when: recipient is a WhatsApp user, permission is granted (`canCall` true), business number country is allowed, and WhatsApp is cheaper/comparable (free-inbound doesn't apply, but outbound may beat PSTN for the country) — **and** the tenant enabled WhatsApp-preferred.
   - **Fall back to PSTN/SIP** when: no permission, blocked country, WhatsApp restricted, or PSTN is cheaper. Never violate `canCall`/DNC.
   - Expose the decision + reason on the Call (for transparency + analytics). Config: per-tenant routing policy (WhatsApp-preferred / PSTN-preferred / cheapest / WhatsApp-only-if-permitted).
2. **Pickup + report guardrails** — compute rolling **pickup rate** (answered/attempted) and consume the `account_update` restriction/violation webhooks (WAC-02). When pickup dips or reports rise toward the danger zone, **auto-throttle** WhatsApp outbound (reduce attempts / require stronger consent) and raise an operator alert (existing `Notification`), *before* Meta hides the call button. On an actual `RESTRICTED_*`/`account_violation`, mark the number restricted (with expiry), stop the relevant direction, surface a clear banner + remediation steps, and route around it (PSTN).
3. **Health surfacing** — a small "WhatsApp calling health" widget (pickup rate, report rate, any active restriction + expiry, current tier/minutes) on the WAC-07 panel + super-admin ops; reuse `Meter`/`StatCard`/`Badge`.
4. **Tests** — route selection picks WhatsApp when permitted+cheaper, PSTN when blocked/no-permission/cheaper (with the recorded reason); country-block forces PSTN; restriction webhook flips the number to restricted + routes around it + alerts; pickup-rate throttle triggers at threshold; tenant routing policy honored; never routes against `canCall`/DNC; tenant-scoped.

## Definition of Done
- [ ] One outbound `dial` auto-selects the cheapest **allowed** route (WhatsApp ↔ PSTN/SIP), records the decision+reason, and falls back correctly on no-permission/blocked-country/restriction.
- [ ] Pickup-rate + report-rate guardrails auto-throttle + alert before `RESTRICTED_*`; real restrictions route around + surface remediation.
- [ ] A WhatsApp-calling-health widget shows pickup/report/restriction/tier.
- [ ] Tests pass; typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **A (route choice correctness + recorded reason; never against `canCall`/DNC), C/G (guardrails actually prevent policy violations; country block honored), E (restriction webhooks handled → route around + remediate, never a hard failure), B (per-tenant policy + scope).**

## Commit plan
`feat(api): WhatsApp least-cost routing + restriction/pickup guardrails [wac-09]` — branch `wac/09-routing-guardrails` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
Outbound now routes least-cost across WhatsApp/PSTN with automatic guardrails against Meta restrictions. **Core WhatsApp Calling module complete.** Next (optional): WAC-10 SIP mode, WAC-11 video.
