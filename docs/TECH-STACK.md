# TECH-STACK.md — Exact Stack, Versions & Rationale

Pin these. Do not bump majors mid-build without recording it in `BUILD-LOG.md`. Use **pnpm** workspaces in a **Turborepo**. Node **20 LTS**. Python **3.12**.

> "Latest stable in this major" is acceptable for minors/patches; the majors below are fixed for the project.

---

## Monorepo & tooling

| Tool | Version | Role |
|------|---------|------|
| pnpm | 9.x | Package manager (workspaces) |
| Turborepo | 2.x | Monorepo task orchestration + caching |
| TypeScript | 5.6+ | Strict everywhere |
| Biome | 1.9+ | Fast lint + format (or ESLint+Prettier if preferred — pick one, stay consistent) |
| Vitest | 2.x | Unit tests (TS) |
| Playwright | 1.48+ | E2E |
| Docker | latest | Local Postgres/Redis/LiveKit + builds |

---

## `apps/web` — Frontend

| Package | Version | Notes |
|---------|---------|-------|
| next | 15.x | App Router, RSC, server actions |
| react / react-dom | 19.x | — |
| tailwindcss | 4.x | Design tokens; dark mode `class` strategy |
| shadcn/ui | latest | Components copied into `packages/ui` |
| @radix-ui/* | latest | Primitives under shadcn |
| @xyflow/react (React Flow) | 12.x | **The agent builder canvas** |
| @tanstack/react-query | 5.x | Server state |
| @tanstack/react-table | 8.x | Data grids (leads, calls) |
| zustand | 5.x | Local/canvas state |
| react-hook-form + zod + @hookform/resolvers | latest | Forms + validation |
| framer-motion | 11.x | Motion/transitions |
| lottie-react | latest | Animated illustrations |
| @formkit/auto-animate | latest | List/layout micro-animations |
| recharts | 2.x | Charts |
| @visx/* | latest | Bespoke voice/sentiment viz |
| socket.io-client | 4.x | Live call/dashboard updates |
| livekit-client | 2.x | Browser WebRTC calling widget |
| wavesurfer.js | 7.x | Recording waveform + transcript sync |
| lucide-react | latest | Icons |
| cmdk | latest | Command palette |
| sonner | latest | Toasts |
| dnd-kit | latest | Kanban lead pipeline |
| @clerk/nextjs | latest | Auth UI/session |

---

## `apps/api` — App backend (NestJS)

| Package | Version | Notes |
|---------|---------|-------|
| @nestjs/* | 10.x | Modular DI framework |
| prisma / @prisma/client | 5.x | ORM, migrations (schema in `packages/db`) |
| zod | 3.x | DTO validation (via nestjs-zod) |
| nestjs-zod | latest | Zod ↔ Nest DTOs |
| bullmq | 5.x | Job queues (enqueue side) |
| ioredis | 5.x | Redis client |
| socket.io | 4.x | Realtime gateway |
| @clerk/backend | latest | Token verification |
| stripe | latest | Billing |
| passport + guards | as needed | Auth strategies/SSO later |
| pino + nestjs-pino | latest | Structured logging |
| @sentry/node | latest | Errors |

---

## `apps/voice` — Real-time voice service (Python)

| Package | Version | Notes |
|---------|---------|-------|
| python | 3.12 | Use `python3` on Mac |
| fastapi | 0.115+ | HTTP control surface for the voice service |
| uvicorn | latest | ASGI server |
| pipecat-ai | latest | Real-time voice pipeline (STT→LLM→TTS, turn-taking) |
| livekit + livekit-agents | latest | WebRTC media + agent runtime |
| livekit-api | latest | Server SDK (tokens, rooms) |
| pydantic | 2.x | Validation/config |
| sqlalchemy | 2.x (async) | DB access from voice side |
| celery | 5.x | Heavy async (batch transcription, scoring) |
| redis | latest | Broker/cache |
| openai / anthropic / google-genai | latest | LLM SDKs (behind router) |
| deepgram-sdk | latest | STT |
| elevenlabs | latest | TTS |
| httpx | latest | Async HTTP to other providers |
| structlog | latest | Logging |

---

## `packages/db` — Data layer

- **PostgreSQL 16** (Supabase or managed).
- **TimescaleDB** extension — call metrics / usage time-series.
- **pgvector** extension — embeddings for RAG + semantic transcript search.
- **Prisma** schema is the source of truth; RLS policies added via SQL migrations alongside Prisma migrations.
- **Qdrant** optional at scale for vectors.
- **ClickHouse** optional at scale for high-volume event analytics.

---

## `packages/provider-router` — The abstraction that protects margin

A standalone TS package exposing typed interfaces:

```
LLMProvider   { complete(), stream(), embed() }
TTSProvider   { synthesizeStream() }
STTProvider   { transcribeStream() }
TelephonyProvider { dial(), answer(), transfer(), hangup() }
```

- Each concrete provider (OpenAI, Anthropic, Gemini, Grok, ElevenLabs, PlayHT, Cartesia, Deepgram, AssemblyAI, Twilio, Telnyx, LiveKit) implements the interface.
- A `Router` selects a provider per call based on: tenant config, BYOK vs managed, language, cost ceiling, latency target, and availability/fallback chain.
- Returns a normalised `UsageRecord { provider, units, costUsd }` for cost attribution.
- The Python voice service mirrors these interfaces (shared contract documented in `ARCHITECTURE.md`).

---

## Infra / DevOps

| Concern | Choice |
|---------|--------|
| Web hosting | Vercel (edge + CDN) |
| API/voice/workers hosting | Railway/Render to start → AWS/GCP (containers, K8s) at scale |
| Voice media | LiveKit Cloud (or self-host on low-latency VPS) |
| CDN / WAF / DNS / custom domains | Cloudflare (+ Cloudflare for SaaS) |
| Object storage | Cloudflare R2 (S3-compatible, no egress fees) |
| Secrets | Doppler (or host secret store) + KMS envelope encryption for provider keys in DB |
| CI/CD | GitHub Actions (typecheck, lint, test, build, deploy, preview per PR) |
| IaC | Terraform (`infra/`) |
| Observability | Sentry + Prometheus/Grafana + OpenTelemetry + PostHog + Better Stack (uptime/status) |
| Email/SMS | Resend (email), Twilio (SMS), WhatsApp Cloud API (later) |

---

## Versioning policy

- Lockfile committed (`pnpm-lock.yaml`).
- Renovate/Dependabot optional for patch PRs; never auto-merge majors.
- Python deps pinned in `apps/voice/requirements.txt` (or `pyproject.toml` + uv/poetry — pick one).
- Any deviation from this file → note it in `BUILD-LOG.md` with reason.
