# DAY 59 — SSO/SAML (WorkOS) + Enterprise Auth  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- WorkOS (or Clerk Enterprise) — WORKOS_API_KEY/CLIENT_ID.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.10
- DATA-MODEL.md (User, Membership)
- CODING-RULES.md (security)

## Objective
Enterprise authentication: SSO/SAML + directory sync (SCIM) per enterprise tenant, alongside existing auth, with role mapping.

## Step-by-step build
1. WorkOS SSO/SAML integration: per-tenant IdP config; SP metadata; login flow.
2. Directory sync (SCIM) -> Memberships + role mapping; just-in-time provisioning.
3. Coexist with Clerk auth; tenant chooses method.
4. Tests: SAML login (mocked IdP), SCIM provisioning + role mapping, tenant-scoped IdP config.

## Definition of Done
- [ ] Enterprise tenants log in via SSO/SAML with directory sync + role mapping; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (SAML validation, IdP config isolation) + B + A.**

## Commit plan
`feat(api,web): SSO/SAML + enterprise auth (Day 59)` — branch `day/59-sso-saml` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Enterprise auth ready. Next: compliance track.
