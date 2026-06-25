# GIT-WORKFLOW.md — Branching, Commits & Push Discipline

Clean Git history is part of the deliverable. Follow this exactly.

## ⚑ The two fixed facts
- **Local code path:** `/Users/saransh/Documents/VOCAL-IQ` — the git repo root; all code lives here, nowhere else.
- **Remote:** `https://github.com/thequantcoder/VOCAL-IQ` — the only remote (`origin`).

## ⚑ Auto-commit-and-push mandate (do this without being asked)
After **every** change — a completed day, a finished module, a bug fix, a refactor, a doc/config tweak, ANY modification — automatically:
```bash
git add -A
git commit -m "<type>(<scope>): <subject>  [Day NN]"   # descriptive, Conventional Commits
git push                                               # never leave the remote behind local
```
One logical change per commit; **multiple commits per day are expected**, each pushed. A change is not "done" until it's committed **and** pushed. Never push secrets/`.env`. If a push fails, stop and tell the admin exactly what's needed — never leave work unpushed silently.

---
 The path and remote above are fixed and already wired into this kit — Claude uses them directly.

---

## Day 0 setup (Claude does this once)

```bash
cd /Users/saransh/Documents/VOCAL-IQ
git init
git remote add origin https://github.com/thequantcoder/VOCAL-IQ
git branch -M main
# scaffold, then:
git add .
git commit -m "chore: scaffold VocalIQ monorepo (Day 0)"
git push -u origin main
```
Create a comprehensive `.gitignore` first (node_modules, .env*, dist, .turbo, .next, __pycache__, *.pyc, coverage, .DS_Store, recordings, local data volumes).

---

## Branching model

- `main` — always green, deployable.
- `day/NN-short-slug` — one branch per day (e.g. `day/07-provider-router-core`).
- Build on the day branch, open a PR into `main`, ensure CI is green, then merge (squash or merge commit — be consistent; squash recommended to keep one clean commit per day, but multiple commits during the day are encouraged on the branch).
- Tag phase completions: `v0.1-phase0`, `v0.2-phase1`, etc.

> If working solo without PRs, committing directly to `main` is acceptable **only if** CI passes locally first. Prefer the branch+PR flow so CI runs on the PR.

---

## Commit message format (Conventional Commits)

```
<type>(<scope>): <subject>   [Day NN]

<body: what & why, not how>

Refs: Day NN — <day title>
Self-audit: passed (A–K)
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`, `style`.
**Scopes:** `web`, `api`, `voice`, `workers`, `db`, `router`, `ui`, `shared`, `infra`, `auth`, `billing`, `tenancy`, etc.

**Examples:**
```
feat(router): add LLM provider abstraction + OpenAI/Anthropic adapters  [Day 07]

Introduces typed LLMProvider interface and Router with cost-ceiling and
fallback selection. Emits UsageRecord on every call for attribution.

Refs: Day 07 — Provider Router core
Self-audit: passed (A–K)
```
```
feat(api,db): tenant model + RLS policies + isolation tests  [Day 04]

Refs: Day 04 — Multi-tenant data model
Self-audit: passed (A–K)
```

- One **logical** change per commit. Multiple commits per day is good.
- Subject ≤ 72 chars, imperative mood ("add", not "added").
- Reference the day in every commit.

---

## When to commit (during the daily loop)

1. After each cohesive increment (a module + its tests), commit on the day branch.
2. After the **self-audit passes**, make the final day commit (or merge the day branch to `main`).
3. Then **push**. Never push red CI.

---

## Push & PR

```bash
git push -u origin day/NN-short-slug
# open PR -> main, title: "Day NN — <title>", body: summary + self-audit result + DoD checklist
# wait for CI green -> squash merge -> delete branch
```

Always include in the PR/commit description:
- What was built (bullets mapping to the day's Definition of Done).
- Decisions/trade-offs.
- New env vars / migrations / admin actions.
- Self-audit result (A–K) and anything deferred.

---

## Migrations

- DB schema changes go through Prisma migrations + the matching RLS SQL in `packages/db/rls/`.
- Never edit a shipped migration; add a new one.
- Migration name references the day: `pnpm prisma migrate dev --name day07_provider_credentials`.
- Commit the migration with its feature.

---

## What never gets committed

- `.env`, `.env.local`, any real secret (only `.env.example` with names).
- `node_modules`, `dist`, `.next`, `.turbo`, coverage, `__pycache__`.
- Recordings, uploads, large media, local DB volumes.
- Generated Prisma client (it's regenerated) unless the setup requires it — prefer regenerate in CI/postinstall.

---

## CI gate (`.github/workflows/ci.yml`, built Day 1)

On every PR/push to `main`:
1. Install (pnpm, cached).
2. `pnpm typecheck` (all TS).
3. `pnpm lint`.
4. `pnpm test` (unit + integration with a service container Postgres/Redis).
5. Voice: `pip install` + `pytest` + type check.
6. `pnpm build` (all apps).
7. **Security scans:** dependency/vuln scan (Dependabot/Renovate + audit), secret scan (gitleaks), SAST, and **container image scan (Trivy/Grype)** before any image is pushed.
8. (Phase 4+) deploy previews.

Merging requires all green. This is the objective "done" gate referenced by the daily loop.

---

## Daily report → BUILD-LOG.md

After pushing, append to `BUILD-LOG.md`:
```
## Day NN — <title> — <date>
Commits: <hashes/links>
Built: <bullets>
Decisions: <bullets>
Migrations/env added: <list>
Deferred: <list or none>
Admin actions needed next: <list or none>
Self-audit: passed
```
