# DAY 57 — Provider Key Vault + Routing Defaults + Key-Pool Admin  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 6-7 router; Day 38 key pools; KMS for envelope encryption.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.9
- DATA-MODEL.md (ProviderCredential, PlatformApiKeyPool)
- ARCHITECTURE.md (security)

## Objective
Securely store + rotate platform + tenant provider keys, set default routing + fallbacks, and administer the load-balanced key pools — all encrypted, audited, never exposed.

## Step-by-step build
1. Key vault UI (super-admin): add/rotate/revoke platform keys; envelope-encrypted at rest (KMS); never displayed after entry.
2. Routing defaults: set default + fallback providers per capability; cost/latency policy; per-plan overrides.
3. Key-pool admin: manage PlatformApiKeyPool (weights, health, eject) from Day 38.
4. Tenant BYOK management surface (tenant adds own keys; same encryption).
5. Tests: encryption round-trip (never plaintext in logs/DB dumps), rotation, routing-default application, key-pool admin, audit on every change.

## Definition of Done
- [ ] Keys stored encrypted + rotatable + audited; routing defaults + key pools manageable; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (encryption, no exposure, audit — critical) + D (routing) + B.**

## Commit plan
`feat(api,web): provider key vault + routing defaults + key-pool admin (Day 57)` — branch `day/57-key-vault` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Keys secured + controllable. Next: flags, entitlements, quotas, audit.
