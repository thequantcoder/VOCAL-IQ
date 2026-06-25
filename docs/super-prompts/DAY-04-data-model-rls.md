# DAY 04 — Multi-Tenant Data Model + Prisma Schema + RLS  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- DATABASE_URL + DIRECT_URL (Postgres 16 + timescaledb + pgvector).
- Confirm base currency + initial plan tiers (adjustable later).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md (golden rule #1)
- DATA-MODEL.md (entire file)
- ARCHITECTURE.md (tenancy)

## Objective
Implement the complete multi-tenant schema in Prisma exactly per DATA-MODEL.md with migrations, RLS, subtree fn, and seed. The most important architectural day.

## Step-by-step build
1. Author schema.prisma covering ALL entities in DATA-MODEL (Tenant hierarchy, User, Membership, ProviderCredential, PlatformApiKeyPool, Agent, Flow/FlowVersion, Voice, KnowledgeBase/KbChunk vector, AgentMemory, Contact, Lead, PhoneNumber, SipTrunk, Call, Transcript, Campaign/CampaignContact, Appointment, Plan, Subscription, Wallet, UsageRecord, Invoice, ResellerMargin, Integration, Webhook, SupportTicket, Notification, AuditLog, FeatureFlag).
2. tenantId + index on every tenant table; composite indexes on hot paths; pgvector index on KbChunk; Timescale hypertables for UsageRecord + call metrics.
3. RLS SQL in packages/db/rls/: enable RLS on every tenant table; tenant_isolation policy via current_setting('app.current_tenant'); is_in_subtree(child,ancestor) for reseller access; privileged bypass role for audited admin paths.
4. Migrations: day04_initial_schema + separate RLS migration; wire prisma migrate.
5. Connection helper setting app.current_tenant per request/session (used Day 5 + Day 8).
6. Seed: PLATFORM tenant, demo RESELLER, demo CUSTOMER, super-admin user + memberships, sample plan ladder.
7. Cross-tenant isolation test scaffold (full test Day 5).

## Definition of Done
- [ ] Schema compiles; migration applies to fresh DB; extensions present.
- [ ] Every tenant table has tenantId + index + RLS; subtree fn works.
- [ ] Seed produces platform/reseller/customer + super-admin.
- [ ] Connection helper sets current_tenant (verified).

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (tenancy) above all — verify RLS blocks cross-tenant via psql with different current_tenant. Also F (indexes), J (matches DATA-MODEL exactly).**

## Implementation detail & gotchas (read before coding)
- **Follow `DATA-MODEL.md` exactly** — every entity, every `tenantId`, every index. Use `CODE-PATTERNS.md §12` (new-table checklist) for each model.
- **RLS is the safety net, app filters are the front door — build both.** RLS uses `current_setting('app.current_tenant')`; the API sets it per request (`CODE-PATTERNS.md §1`), the voice service per call.
- **`is_in_subtree(child, ancestor)`** must let a reseller see its descendants but NOT a sibling reseller. Implement as a recursive SQL function over `parentTenantId`; test both directions.
- **Privileged bypass:** super-admin operations that legitimately cross tenants use a separate DB role/path that bypasses RLS, and every such action is written to `AuditLog`. Never bypass RLS casually.
- **Extensions:** ensure `vector` and `timescaledb` are enabled (Day 1 docker init). pgvector index (HNSW or IVFFlat) on `KbChunk.embedding`. Timescale hypertables on `UsageRecord` + call-metric tables.
- **Encrypted columns:** `ProviderCredential.encryptedKey`, `SipTrunk.encryptedCreds`, `Voiceprint.encryptedTemplate` store ciphertext bytes only (envelope encryption — see `CODE-PATTERNS.md §5`). Never a plaintext key column.
- **Migrations:** one for schema (`day04_initial_schema`), a separate one for RLS SQL. Never edit a shipped migration later; add a new one.
- **Seed realistically:** PLATFORM tenant, one RESELLER, one CUSTOMER under it, a SUPER_ADMIN user with memberships, and a starter plan ladder — so later days have data to work with.

## Acceptance tests (must exist + pass)
- [ ] Migration applies cleanly to a fresh DB; `vector` + `timescaledb` present.
- [ ] Every tenant-owned table has `tenantId` + index + an RLS policy (write a test that introspects this).
- [ ] psql test: set `app.current_tenant` to tenant A, query tenant B's rows → 0 rows.
- [ ] `is_in_subtree`: reseller R sees child C's rows; R does NOT see sibling reseller R2's rows.
- [ ] Seed produces platform/reseller/customer + super-admin with correct memberships.
- [ ] Connection helper sets `app.current_tenant` and resets it between requests (no leakage across pooled connections).

## Commit plan
`feat(db): multi-tenant schema, RLS, subtree fn, seed (Day 4)` — branch `day/04-data-model-rls` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
DB reachable + migrated; RBAC + isolation tests land Day 5.
