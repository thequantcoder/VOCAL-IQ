# DAY 02 — Shared Package: Types, Zod, Env Schema, Error Model  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- None beyond Day 1.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- CODING-RULES.md (validation, errors)
- DATA-MODEL.md
- ARCHITECTURE.md

## Objective
Build packages/shared: domain types/enums, Zod schemas, env schema, typed error model, constants, UsageRecord type, query-key factories — one contract for all apps.

## Step-by-step build
1. Enums/constants matching DATA-MODEL (TenantType, Role, CallStatus, Provider, Capability, PlanFeature...).
2. Zod DTO schemas + parseEnv() validating all env vars (names from PREREQUISITES), failing fast with a clear missing-list.
3. Typed error model: AppError base (code, httpStatus, safeMessage) + domain errors (Tenant/Auth/Provider/Billing/Validation); safe vs internal separation.
4. Result helpers + UsageRecord type (provider, capability, units, costUsd, byok).
5. Tenant-namespaced TanStack query-key factories.
6. Unit tests: env parser (missing/invalid), error serialisation, schema round-trips.

## Definition of Done
- [ ] Shared exports types/enums/zod/env/errors/UsageRecord.
- [ ] api/web/workers import it under strict TS.
- [ ] Env parser fails fast (tested).
- [ ] Error model safe vs internal (tested).

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B/C/J — no any, env never leaks values, errors never expose internals.**

## Commit plan
`feat(shared): domain types, zod, env + error model (Day 2)` — branch `day/02-shared-types-env-errors` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
List enforced env var names so admin fills .env before Days 3-6.
