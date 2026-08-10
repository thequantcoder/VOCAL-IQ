# DAY 54 — Reseller Portal Dashboards (Revenue, Margin, Clients)  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 53 engine.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- Blueprint §7.2 (Reseller Portal)
- DATA-MODEL.md (ResellerMargin)
- packages/ui

## Objective
> 🎨 **Design direction:** DESIGN-SYSTEM.md §5e: scope-aware panels with a persistent platform→reseller→customer scope indicator.

The reseller's control surface: branding + domain config, plan creation/pricing/markup for their customers, sub-tenant lifecycle, wallet/credit management, and revenue + margin dashboards.

## Step-by-step build
1. Reseller portal: branding/domain settings, sub-tenant management UI, wallet/credit views.
2. Plan creation + pricing/markup for their customers (uses Day 56 plan builder primitives, scoped to reseller).
3. Dashboards: revenue, margin, client usage, top clients, spend vs earn.
4. Tests: reseller-scoped data only, plan/markup creation, dashboard accuracy.

## Definition of Done
- [ ] Resellers manage branding/domains/plans/clients + see revenue & margin; reseller-scoped; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (reseller-scoped) + D (numbers match engine) + H.**

## Commit plan
`feat(web): reseller portal dashboards (Day 54)` — branch `day/54-reseller-portal` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Resellers self-serve. Next: super-admin console.
