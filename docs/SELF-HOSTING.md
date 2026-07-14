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

## First-run setup

1. **Admin user** — the first user to sign up on a fresh install is the platform super-admin.
   (Or seed one: the `prisma/seed.ts` seed creates a platform tenant + super-admin for local dev.)
2. **Branding (white-label)** — as the super-admin, open **Dashboard → Settings → Appearance** (and
   **Branding**) to set your product name, logo, and colour tokens; resellers can theme their own
   sub-tenants. Custom domains are optional (set `CLOUDFLARE_SAAS_ZONE_ID` for automated SSL, or point
   your own DNS + Nginx). No code changes needed — theming is data-driven (Day 52).
3. **BYOK** — each tenant adds its own provider keys under **Developers / Integrations**, or you set
   platform-wide keys in `.env`. Nothing is hard-wired to a vendor.

## Versioning & "Check for Updates"

VocalIQ ships a `VERSION` file at the repo root — the single source of truth. Bake it into the build
so the running app knows its version:

```bash
export APP_VERSION=$(cat VERSION)   # do this before `pnpm build` / when starting the api
```

Set `UPDATE_MANIFEST_URL` (see `.env.example`) to a published release manifest — e.g. the
`infra/releases.json` served from GitHub Releases / raw GitHub. The super-admin console shows a
**Version** card that fetches the manifest and reports **up to date / update available** (with release
notes + a changelog link). It is **read-only and never auto-applies** — upgrades are always a
deliberate operator action. On hosted SaaS just leave `UPDATE_MANIFEST_URL` unset (the card shows
"couldn't check").

The published manifest (`infra/releases.json`) looks like:

```json
{ "latest": "1.2.0", "minCompatible": "1.0.0", "releasedAt": "2026-08-01",
  "notes": "…", "url": "https://github.com/thequantcoder/VOCAL-IQ/releases" }
```

If your installed version is **below `minCompatible`**, upgrade in steps (the card warns you).

## Upgrading

1. **Back up first** (see below).
2. `git fetch && git checkout <new-tag>` (or pull the new release), then `pnpm install && pnpm build`.
3. `pnpm --filter @vocaliq/db exec prisma migrate deploy` (migrations are additive + ordered).
4. `export APP_VERSION=$(cat VERSION)` and restart: `pm2 restart all`.
5. Re-run the Python venv install in `apps/voice` if that changed.

## Backup & restore

- **Database** (the important one): `pg_dump -Fc vocaliq > vocaliq-$(date +%F).dump`; restore with
  `pg_restore -d vocaliq --clean vocaliq-YYYY-MM-DD.dump`.
- **Recordings / files**: back up your object store (R2/S3) bucket per its own tooling.
- **Secrets**: keep your `.env` (and any KMS master key) in your secrets manager — **never** in git.

## Shipping a clean build (no secrets)

The distributable must contain **zero** secrets (only `.env.example`). A release guard enforces this —
run it before packaging:

```bash
node scripts/check-no-secrets.mjs   # fails if a real .env is tracked or a live key is committed
```
