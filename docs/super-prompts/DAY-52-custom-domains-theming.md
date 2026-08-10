# DAY 52 — Custom Domains + Per-Tenant Theming (Cloudflare for SaaS)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Cloudflare for SaaS (custom hostnames) + CLOUDFLARE_SAAS_ZONE_ID.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- Blueprint §8.2
- ARCHITECTURE.md (edge)
- DATA-MODEL.md (Tenant.branding, customDomain)

## Objective
> 🎨 **Design direction:** DESIGN-SYSTEM.md §8: tenant white-label tokens must flow through EVERY component so resellers' brands re-theme the entire UI (dark+light).

White-label surface: per-tenant branding (logo, colours, fonts, favicon, email templates) re-theming the whole UI, plus reseller custom domains with automatic SSL via Cloudflare for SaaS.

## Step-by-step build
1. Branding system: design tokens driven by tenant.branding; whole UI re-themes (light/dark); email templates rebrandable; hide platform identity for reseller customers.
2. Custom domains: CNAME flow + Cloudflare for SaaS custom hostnames + automatic SSL; domain verification + status.
3. Tenant resolution by hostname at the edge/gateway -> correct tenant + theme.
4. Tests: theme application, domain provisioning + SSL status, hostname->tenant resolution, no platform branding leak.

## Definition of Done
- [ ] Resellers serve on their own domain with SSL + full branding; no platform identity leaks; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (domain verification, SSL) + B (hostname->tenant) + H (theming).**

## Commit plan
`feat(web,api,infra): custom domains + per-tenant theming (Day 52)` — branch `day/52-custom-domains-theming` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
True white-label. Next (heavy): markup + wallet engine.
