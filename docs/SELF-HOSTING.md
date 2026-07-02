# Self-Hosting VocalIQ

VocalIQ is a **fully self-hostable** platform. The entire software stack is free and
open-source (MIT / Apache / PostgreSQL-license) — you deploy it on your own server and
scale freely, with **no mandatory paid SaaS**.

## Stack (all free & open-source)

| Layer | Tech |
|-------|------|
| Frontend | Next.js (React) + Tailwind + shadcn/ui + Framer Motion |
| Backend API | Node.js + Express |
| Auth | Self-hosted email/password + JWT (no third-party auth service) |
| Database | PostgreSQL + Prisma (with `pgvector` for RAG, TimescaleDB for metrics) |
| Queue/cache | Redis + BullMQ |
| Realtime audio | LiveKit (self-hosted, open-source) |
| Voice service | Python + FastAPI |
| Process manager | PM2 |
| Reverse proxy | Nginx |
| Containers | Docker / docker-compose |

## What costs money (be aware)

The **software** costs nothing to run. But VocalIQ is a **voice-AI** product, so the
"AI brain" and "phone line" are external, usage-priced services. You (or your tenants)
bring your own keys — **BYOK**, no forced subscription:

| Capability | Paid cloud option | Free self-hosted alternative |
|-----------|-------------------|------------------------------|
| LLM | OpenAI, Anthropic | Ollama / vLLM (Llama, etc.) |
| Speech-to-text | Deepgram | Whisper |
| Text-to-speech | ElevenLabs | Piper / Coqui |
| Web/browser calls | — | LiveKit (self-hosted) — free |
| **Phone (PSTN) calls** | Twilio / carrier | ⚠️ always costs money (carriers charge for numbers + minutes) |

> You can run **web-based voice AI for $0/month** with Ollama + Whisper + Piper +
> self-hosted LiveKit. Only real phone-number calling has an unavoidable carrier cost —
> true of every voice platform.

Optional integrations that stay off unless you set their keys: **Sentry** (errors),
**PostHog** (analytics), **Stripe** (billing your own customers).

## Quick start (development)

```bash
pnpm install
cp .env.example .env         # fill in DATABASE_URL + any provider keys you use
pnpm dev:infra               # Postgres + Redis + LiveKit via docker-compose
pnpm --filter @vocaliq/db exec prisma migrate deploy
pnpm --filter @vocaliq/db exec tsx prisma/seed.ts
pnpm dev                     # web + api + workers
# voice service:
cd apps/voice && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]" && uvicorn app.main:app --reload
```

## Production (your own server)

1. **Provision** a Linux server (2+ vCPU, 4GB+ RAM), install Node 20, pnpm, Python 3.12,
   PostgreSQL 16 (+ `pgvector`), Redis, Nginx, and PM2 (`npm i -g pm2`).
2. **Configure** the root `.env` (DB, JWT secret, provider keys). Never commit it.
3. **Build**: `pnpm install && pnpm build`, and set up the Python venv in `apps/voice`.
4. **Migrate**: `pnpm --filter @vocaliq/db exec prisma migrate deploy`.
5. **Start** all services: `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`.
6. **Reverse proxy**: copy `infra/nginx/vocaliq.conf.sample` to Nginx, set your domain,
   get free TLS with `certbot --nginx`, then `nginx -t && systemctl reload nginx`.

That's it — a fully self-hosted, self-owned VocalIQ with no per-seat SaaS bills.
