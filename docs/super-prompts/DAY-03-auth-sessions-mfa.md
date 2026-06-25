# DAY 03 — Authentication, Sessions & MFA (Clerk)  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Clerk account + CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
- Decide methods (email/password, magic link, Google).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- CODING-RULES.md (security)
- DATA-MODEL.md (User, Membership)
- ARCHITECTURE.md (security)

## Objective
Wire auth end-to-end: sign-up/in/out, sessions, MFA, social login, API token verification, User sync — tenancy/RBAC come Day 5.

## Step-by-step build
1. Integrate Clerk in web (App Router): sign-in/up pages, session provider, protected (dashboard) group.
2. Enable MFA + social providers; reflect in UI.
3. api AuthGuard verifies Clerk tokens (@clerk/backend); attach user to request.
4. Sync Clerk user -> local User row (webhook or first-request upsert); store authProviderId.
5. /me endpoint returns user + memberships.
6. Tests: guard rejects bad tokens; upsert idempotent; protected routes redirect.

## Definition of Done
- [ ] Sign up/in, MFA, sign out, social login work.
- [ ] API rejects unauthenticated; accepts valid tokens.
- [ ] User synced; /me works.
- [ ] No secret leaks; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (token verification, no leakage) + I.**

## Commit plan
`feat(auth): Clerk auth, sessions, MFA, user sync (Day 3)` — branch `day/03-auth-sessions-mfa` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Confirm Clerk methods; tenancy/RBAC land Day 4-5.
