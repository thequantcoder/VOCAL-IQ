# DAY 51 — Reseller Hierarchy + Sub-Tenant Provisioning  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 4-5 tenancy.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §8
- DATA-MODEL.md (Tenant hierarchy)
- ARCHITECTURE.md (tenancy)

## Objective
Make resellers first-class: a reseller owns/creates/suspends sub-tenants, all isolated, building on the Day 4-5 hierarchy.

## Step-by-step build
1. Reseller provisioning: create/suspend/manage sub-tenants without platform involvement; lifecycle states.
2. Enforce reseller subtree isolation (RLS subtree + guards): a reseller sees only its own children, never a sibling reseller.
3. Reseller-scoped admin endpoints (RESELLER_ADMIN role).
4. Tests: provisioning, subtree isolation (reseller A can't touch reseller B's subtree), suspend cascade.

## Definition of Done
- [ ] Resellers provision/manage isolated sub-tenants; subtree isolation proven; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (subtree isolation — critical) + C (RESELLER_ADMIN gating).**

## Commit plan
`feat(api,web): reseller hierarchy + sub-tenant provisioning (Day 51)` — branch `day/51-reseller-hierarchy` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Reseller backbone. Next: custom domains + theming.
