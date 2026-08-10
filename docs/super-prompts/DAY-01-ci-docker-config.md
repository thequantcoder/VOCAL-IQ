# DAY 01 — CI/CD, Docker Dev Stack & Base Config  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- GitHub Actions enabled (default).
- Docker Desktop running.
- Sentry + PostHog keys if wiring now (else stub).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- GIT-WORKFLOW.md (CI gate)
- TECH-STACK.md
- ARCHITECTURE.md (environments)

## Objective
> 🎨 **Design direction:** Implement the DESIGN-SYSTEM.md token system + Waveform — this is the visual foundation every later screen inherits. Do NOT ship shadcn defaults.

Stand up CI (typecheck/lint/test/build), a local docker-compose dev stack (Postgres+Timescale+pgvector, Redis, LiveKit), and base design tokens so every later day has a green pipeline and one-command local env.

## Step-by-step build
1. Write `.github/workflows/ci.yml` per GIT-WORKFLOW CI gate: install (pnpm cache) -> typecheck -> lint -> test (Postgres+Redis service containers) -> build; Node 20; plus a Python job for apps/voice (pip + pytest + pyright).
2. Create infra/docker-compose.yml: Postgres 16 with timescaledb + pgvector, Redis 7, LiveKit dev server; add `pnpm dev:infra` to bring it up.
3. DB init SQL enabling `vector` + `timescaledb` extensions.
4. Wire Sentry + PostHog init in web + api (no-op if keys absent).
5. **packages/ui base — implement `DESIGN-SYSTEM.md` foundation (not shadcn defaults):** the full token system (palette §1, typography §2 with the display/body/mono faces, radii + spacing §3, motion vars §4), dark **and** light themes, shadcn init re-skinned to the VocalIQ identity, plus the first core components: Button, Card, Input, and the **signature Waveform component** (§5/§0). Add `DESIGN-SYSTEM.md` to context.
6. Optional pre-commit (lint-staged) running typecheck/lint on staged files.
7. Prove CI green on a PR.

## Definition of Done
- [ ] CI runs on PR and passes all stages (TS + Python).
- [ ] docker compose gives working Postgres(+ext)+Redis+LiveKit.
- [ ] Tokens + 3 base components render in light & dark.
- [ ] Sentry/PostHog init cleanly or no-op.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **K (build/CI) + H (tokens/dark mode). Test the gate actually fails on a broken test.**

## Commit plan
`ci: pipeline, docker dev stack, design tokens (Day 1)` — branch `day/01-ci-docker-config` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Share CI run link; note provider keys needed for Day 3+.
