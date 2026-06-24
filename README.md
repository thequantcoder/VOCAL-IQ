# VocalIQ

Multi-tenant, white-label **Agentic Voice AI SaaS**. Businesses design AI voice
agents in a visual node builder, deploy them on phone / web / SIP, run inbound +
outbound calls and campaigns in many languages and voices, capture leads, book
appointments, and analyse every call. Sold direct, via resellers (white-label
sub-tenants), and via a metered API.

## Monorepo layout

```
apps/
  web/      Next.js 15 — dashboard, agent builder, admin, reseller, agent desk, web-call widget
  api/      NestJS — auth, tenancy, billing, agents CRUD, analytics, webhooks, public API
  voice/    Python FastAPI + Pipecat/LiveKit — real-time call loop
  workers/  BullMQ — campaigns, transcription, scoring, webhooks, reconciliation
packages/
  db/              Prisma schema + migrations + RLS + generated client
  shared/          shared TS types, Zod schemas, env loader, error model, UsageRecord
  provider-router/ LLM/TTS/STT/telephony abstraction (cost-metered, BYOK-aware)
  ui/              shared React components (shadcn-based) + design tokens
  config/          tsconfig / biome / tailwind preset
infra/    Terraform, docker-compose
docs/     the build kit (CLAUDE.md kept at repo root too)
```

## Prerequisites

- Node 20 LTS (this machine runs Node 24 — see `docs/BUILD-LOG.md` Day 0)
- pnpm 9+ · Python 3.12 (this machine runs 3.14 — see Day 0 note) · Docker Desktop

## Develop

```bash
pnpm install          # install workspace deps
pnpm typecheck        # all TS packages/apps
pnpm build            # build everything via Turbo
pnpm dev              # run apps in dev
pnpm test             # unit/integration tests
```

Health checks: web `GET /api/health`, api `GET /healthz`, voice `GET /healthz`.

Voice service (separate, Python):

```bash
cd apps/voice
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
uvicorn app.main:app --port 8000
```

## How this project is built

Day-by-day per the build kit in `docs/` — read `docs/00-START-HERE.md`, then
`docs/PROMPT-INDEX.md`, then the `docs/super-prompts/`. The operating rules live
in `CLAUDE.md` (repo root). Every change is committed and pushed; every day ends
with the A–K self-audit (`docs/SELF-AUDIT-PROTOCOL.md`).
