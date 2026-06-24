# DAY 48 — Public API + SDKs + Webhooks + Rate Limits/Metering  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 13, 15 (metering).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md
- CODING-RULES.md (security)
- DATA-MODEL.md (Webhook)

## Objective
A clean documented public REST API + webhooks + client SDKs so developers embed VocalIQ, with per-key rate limiting + usage metering + billing.

## Step-by-step build
1. Public API (agents, calls, campaigns, leads, numbers) with API-key auth (tenant-scoped), versioning, OpenAPI spec.
2. Per-key rate limiting + usage metering + billing (ties to plans).
3. Webhooks with HMAC signing + retry + dead-letter; event catalogue.
4. Generate a TS SDK (+ stub others) from OpenAPI; docs section.
5. Tests: auth + rate limit + metering, webhook signing/retry, SDK smoke, OpenAPI validity.

## Definition of Done
- [ ] Documented public API + webhooks + TS SDK; rate-limited + metered; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (API-key auth, rate limit, HMAC) + D (metering) + B.**

## Commit plan
`feat(api): public API + webhooks + SDK + rate limits (Day 48)` — branch `day/48-public-api-sdk` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Developer surface live. Next: SaaS ops toolkit.
