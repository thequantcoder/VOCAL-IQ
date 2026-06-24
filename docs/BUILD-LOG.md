# BUILD-LOG.md — Running Build Journal

Claude appends one entry per day **after** pushing (see `GIT-WORKFLOW.md`). This is the project's memory: decisions, deviations, deferrals, and what the admin must do next. Never delete entries; only append.

> Also log here any deviation from `TECH-STACK.md` (version bumps, swapped libraries) with the reason, and any feature intentionally deferred.

---

## Template (copy for each day)

```
## Day NN — <title> — <YYYY-MM-DD>
Model: Opus / Sonnet
Commits: <hashes / PR link>
Built:
- <bullet>
Decisions / trade-offs:
- <bullet>
Migrations added: <names or none>
Env / secrets added: <names or none>
Deviations from TECH-STACK: <none / what + why>
Deferred (with reason): <none / item>
Admin actions needed next: <none / list>
Self-audit: passed (A–K) — open items: <none / list>
Proactive suggestions raised: <none / list>
```

---

## Entries

<!-- Day 0 onward will be appended below. -->

## Day 00 — Repo Scaffold & Monorepo Foundation — 2026-06-24
Model: Opus
Commits: `chore: scaffold VocalIQ monorepo (Day 0)`
Built:
- Turborepo + pnpm workspaces monorepo at repo root (`package.json`, `pnpm-workspace.yaml`, `turbo.json` with dev/build/lint/typecheck/test).
- `packages/config` (base tsconfig [strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes], Biome config, Tailwind preset seeding design tokens).
- `packages/shared` (Zod fail-fast `parseEnv`, typed error model, core enums, `UsageRecord`/`CostBreakdown`) + 3 passing unit tests.
- `packages/db`, `packages/provider-router` (typed LLM/TTS/STT/Telephony contracts + RouteRequest/UsageMeter), `packages/ui` (`cn` helper + brand tokens) — stubs per ARCHITECTURE.md.
- `apps/api` (NestJS `/healthz`, env-validated boot), `apps/web` (Next 15 + Tailwind v4, branded landing + `/api/health`), `apps/voice` (FastAPI `/healthz` + pyproject + pytest), `apps/workers` (BullMQ boot stub).
- `.gitignore`, `.env.example` (Group A–B names only), root `README.md`, kit copied into `docs/`, `infra/docker-compose.yml` + `.github/workflows/ci.yml` placeholders (real CI = Day 1).
Verification: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 3/3, `pnpm build` 7/7 all green; voice `pytest` 1/1 green; api `/healthz`, web `/api/health`, voice `/healthz` all return `{"status":"ok"}`.
Decisions / trade-offs:
- Build with `tsc` per-package (not nest-cli/tsup) for a uniform, dependency-light Day-0 toolchain.
- `packages/ui` ships only `cn` + tokens at Day 0 (no JSX components yet) — full library + Waveform are Day 1 per DESIGN-SYSTEM.md.
- Voice service lives outside the pnpm workspace (Python); verified via its own venv + pytest.
Migrations added: none (Prisma schema is Day 4).
Env / secrets added: none committed (`.env.example` lists names only; no `.env` in repo).
**Deviations from TECH-STACK (machine toolchain newer than pinned majors — logged per CLAUDE.md §4):**
- Node **v24** (pinned 20 LTS), pnpm **10.33** (pinned 9.x), Python **3.14** (pinned 3.12). All non-blocking; everything green. Engines set `node>=20`/`pnpm>=9`; CI pins Node 20 / Python 3.12 for parity. **Watch item:** Python 3.14 vs 3.12 may affect voice deps (Pipecat/LiveKit wheels) on Days 7–9 — consider installing Python 3.12 before then.
- pnpm 10 blocks postinstall scripts by default → added `pnpm.onlyBuiltDependencies` allowlist (biome, esbuild, @nestjs/core, sharp, msgpackr-extract).
Deferred (with reason): real CI pipeline, full docker dev stack (Postgres+timescale+pgvector+Redis+LiveKit), full UI token system + Waveform — all scheduled for Day 1.
Admin actions needed next: Day 1 none required (Sentry/PostHog optional). Day 3 Clerk keys; Day 4 `DATABASE_URL`/`DIRECT_URL` + base-currency/plan-tier decision; Day 6 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`.
Self-audit: passed (A–K) — open items: none.
Proactive suggestions raised: install Python 3.12 before Day 7; add `.nvmrc`/`.node-version` (20) on Day 1 to align local Node with CI.
