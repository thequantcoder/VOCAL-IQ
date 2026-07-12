# PARITY 11 — Self-Hosted White-Label Build + "Check for Updates"  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. Packaging-level — build LAST, after the feature parity days.

## Prerequisites (admin)
- Decision CONFIRMED: we DO ship a self-hosted installable white-label build (owner approved). Needs a release channel (GitHub Releases is fine) + a version-manifest URL.

## Context to load
- CLAUDE.md · golden rule #5 (no secrets in the shipped build) · §0.1 git discipline
- `infra/` (docker-compose, deployment) + existing env/config + Day 52 theming (white-label branding)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #10 + Part 6 (owner decision)

## Objective
Produce a **self-hostable, white-label installable build** (like the CodeCanyon competitors) plus an in-app **"Check for Updates"** version checker — so a buyer can install VocalIQ on their own VPS, brand it, and see when a new version is available.

## Step-by-step build
1. **Installable package**: a documented one-command install (docker-compose profile + `.env.example` + first-run setup: admin user, branding, DB migrate/seed). A build script that produces a distributable artifact WITHOUT any secrets or `.env`.
2. **Versioning**: a `VERSION` source of truth + a published version manifest (e.g. `releases.json` on GitHub Releases) with latest version + release notes + min-compatible.
3. **Check-for-Updates**: a super-admin endpoint + UI that fetches the manifest, compares to the installed `VERSION`, and shows "up to date / update available (notes)". No auto-apply (show instructions/changelog only) — safe by default.
4. **White-label install docs**: `docs/SELF-HOST.md` (install, configure branding, upgrade steps, backup).
5. Tests: version compare (older/equal/newer), manifest-fetch failure degrades gracefully, no-secrets-in-artifact check (a test/script that greps the build for `.env`/keys), super-admin-only gate.

## Definition of Done
- [ ] A clean self-host install path + branding setup + a working, safe "Check for Updates" (manifest compare, no auto-apply); no secrets in the artifact; docs shipped; tests pass.

## Self-audit focus
Full A–K. Special attention: **C (ZERO secrets in the distributable — verified by a test), I (hosted-SaaS mode unaffected by the self-host packaging), J (SELF-HOST.md complete).**

## Commit plan
`feat(infra,web): self-hosted white-label build + Check-for-Updates [parity-11]` — branch `parity/11-selfhost-installer` → PR → CI → merge. **This closes the Competitor-Parity phase.**

## Report to admin
Competitor-Parity phase complete — VocalIQ is now a strict superset of IntelliCall AI + AgentLabs AI. Tag a parity release.
