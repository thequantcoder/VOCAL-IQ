# PARITY 02 — Instant AI Call Endpoint (`POST /calls/dial`, auto-creates lead)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- None new (uses the existing public-API key auth + outbound dial path). Live calls need a configured carrier (Twilio/Telnyx/Plivo) — otherwise the call is created in a QUEUED/mock state.

## Context to load
- CLAUDE.md · golden rules #1 (tenant), #4 (metering)
- Day 48 public API/SDK (API-key auth middleware) + Day 10 outbound dial (`apps/api` + voice service dial path)
- `apps/api/src/numbers` (recent provisioning) for the router/carrier selection pattern
- Schema `Contact`/`Lead`/`Call`; `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #4

## Objective
A one-shot public endpoint that, given a phone number + agent, **auto-creates (or dedupes) a lead** and **dispatches an outbound call** — the "instant dial" primitive competitors expose and that n8n / Form-to-Call build on.

## Step-by-step build
1. Zod contract `instantDialSchema` in `packages/shared`: `{ to: E164, agentId: uuid, fromNumberId?: uuid, leadFields?: record, metadata?: record }`.
2. `POST /v1/calls/dial` under the public-API router (API-key auth + tenant scope + rate limit). Flow: resolve/validate agent + from-number → upsert `Contact`/`Lead` by phone (dedupe) → enqueue/place outbound call via the router → return `{ callId, leadId, status }`.
3. Enforce plan limits (concurrent calls / monthly cap) + abuse checks (reuse Day 70 guards). Meter the call path as usual (`UsageRecord`).
4. Gate: no carrier configured → create the Call row `status=QUEUED` + return 202 (don't fake a live call).
5. Tests (real DB): dedupe upsert, tenant scoping, plan-limit rejection, QUEUED gating, metering.

## Definition of Done
- [ ] `POST /v1/calls/dial` creates/dedupes a lead + dispatches (or QUEUEs) a call, tenant-scoped + metered + rate-limited; tests pass.

## Self-audit focus
Full A–K. Special attention: **A (dedupe correctness), B (tenant scope on every write), D (metered), G (abuse/plan-limit gating).**

## Commit plan
`feat(api,shared): instant AI call endpoint POST /calls/dial [parity-02]` — branch `parity/02-instant-dial` → PR → CI → merge.

## Report to admin
Instant-dial primitive live. Next: PARITY-03 AI Form Builder.
