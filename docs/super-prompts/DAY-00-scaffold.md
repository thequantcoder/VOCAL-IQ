# DAY 00 — Repo Scaffold & Monorepo Foundation  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. This is the foundation; get the structure exactly right.

## Prerequisites (admin)
- ✅ `https://github.com/thequantcoder/VOCAL-IQ` — empty private GitHub repo URL.
- ✅ `/Users/saransh/Documents/VOCAL-IQ` — local Mac folder (e.g. `/Users/saransh/Documents/VocalIQ`).
- ✅ Node 20 LTS + `pnpm` installed; Python 3.12 (`python3`); Docker Desktop running.
- ✅ Doppler account (or decide to use plain `.env` for now) — `DOPPLER_TOKEN` if used.

If `https://github.com/thequantcoder/VOCAL-IQ` or `/Users/saransh/Documents/VOCAL-IQ` are unknown, emit the `🔑 ADMIN ACTION REQUIRED` block and wait.

## Context to load
`CLAUDE.md`, `ARCHITECTURE.md` (repo layout), `TECH-STACK.md`, `GIT-WORKFLOW.md`.

## Objective
Create the Turborepo monorepo skeleton with all apps/packages stubbed, tooling configured, env schema in place, `.gitignore` correct, and the first commit pushed to `main`.

## Step-by-step build
1. **Init repo** at `/Users/saransh/Documents/VOCAL-IQ`: `git init`, remote, `main` branch. Write a thorough `.gitignore` (node_modules, .env*, dist, .next, .turbo, __pycache__, *.pyc, coverage, .DS_Store, /infra/**/.terraform, local volumes, recordings).
2. **Turborepo + pnpm workspaces**: root `package.json`, `pnpm-workspace.yaml`, `turbo.json` (pipelines: dev, build, lint, typecheck, test).
3. **Create app/package stubs** exactly per `ARCHITECTURE.md`:
   - `apps/web` (Next.js 15 + TS + Tailwind v4, minimal landing + health route).
   - `apps/api` (NestJS, `/healthz`).
   - `apps/voice` (FastAPI, `/healthz`, requirements/pyproject).
   - `apps/workers` (Node + BullMQ stub).
   - `packages/db`, `packages/shared`, `packages/provider-router`, `packages/ui`, `packages/config`.
4. **Shared config** in `packages/config`: base `tsconfig`, Biome config, Tailwind preset. All apps extend these.
5. **Env schema**: in `packages/shared`, a Zod-validated `env` loader that fails fast; create `.env.example` (names only, from `PREREQUISITES.md` Group A–B) and a local `.env` (git-ignored) the admin fills.
6. **README.md** at root: what VocalIQ is, how to run dev, link to `docs/` kit. Copy the kit `.md` files into `docs/` (and keep `CLAUDE.md` at root).
7. **Scripts**: root `dev`, `build`, `lint`, `typecheck`, `test` that fan out via Turbo.
8. **Verify**: `pnpm install`, `pnpm typecheck`, `pnpm build` succeed; each `/healthz` returns ok locally.

## Definition of Done
- [ ] Monorepo installs and builds cleanly; all stub apps run and return health.
- [ ] All packages/apps exist per `ARCHITECTURE.md`.
- [ ] Env schema validates; `.env.example` complete; `.env` git-ignored.
- [ ] `docs/` contains the full kit; root `README.md` written.
- [ ] First commit pushed to `main`; CI placeholder runs (real CI is Day 1).

## Self-audit focus
Sections A, J, K especially. Confirm no secrets committed, `.gitignore` correct, structure matches `ARCHITECTURE.md` exactly.

## Commit plan
`chore: scaffold VocalIQ monorepo (Day 0)` → push `main`. Tag nothing yet.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and every increment within it), automatically `git add` → `commit` → `git push` to `https://github.com/thequantcoder/VOCAL-IQ` with a descriptive message.
## Report to admin
Summary, repo tree, commit hash, and confirm which Group A–B credentials are still needed before Day 3–6.
