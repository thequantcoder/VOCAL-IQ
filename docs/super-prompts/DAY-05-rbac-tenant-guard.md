# DAY 05 — RBAC, Tenant Guard & Isolation Tests  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 3 + 4 complete. No new credentials.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md (golden rules)
- DATA-MODEL.md (roles)
- ARCHITECTURE.md (tenancy)
- CODING-RULES.md (#4)

## Objective
Make tenancy + RBAC enforceable everywhere: resolve active tenant, set app.current_tenant, @CurrentTenant, role guard, prove isolation with tests.

## Step-by-step build
1. TenantGuard resolves active tenant from membership (+ switcher header) and sets app.current_tenant on the request DB session.
2. @CurrentTenant() + @Roles() decorators + RolesGuard enforcing the matrix (SUPER_ADMIN, RESELLER_ADMIN, OWNER, ADMIN, BUILDER, ANALYST, AGENT, BILLING).
3. Tenant-scoped repository/base-service so queries auto-filter by tenant (defence in depth).
4. Tenant switching endpoint + reseller subtree resolution.
5. Integration tests: (a) tenant A cannot read/write tenant B; (b) reseller accesses its child not a sibling reseller; (c) ANALYST blocked from mutating; (d) RLS holds even if app filter bypassed.
6. CI step runs isolation tests vs real Postgres.

## Definition of Done
- [ ] Tenant + role guards active; @CurrentTenant works.
- [ ] Isolation tests pass (app + RLS layers).
- [ ] Reseller subtree correct; role matrix enforced.
- [ ] Isolation tests in CI.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B + C — try to break it: write a deliberately unscoped query in a test and confirm RLS still blocks.**

## Commit plan
`feat(api): tenant guard, RBAC, isolation tests (Day 5)` — branch `day/05-rbac-tenant-guard` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Isolation proven. Next: provider router + first AI call.
