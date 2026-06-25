# PREREQUISITES.md — Everything the admin must provide

This is the complete list of accounts, API keys, and decisions Claude will need, **grouped by when**. Set up each group a day or two before its phase so the build never stalls. For every item: create the account, generate the key, and store it under the **exact env var name** given (these names are what the code expects).

> Convention: secrets live in `.env` (local, git-ignored) and in the secrets manager (Doppler or your host's secret store) for deployed envs. Never commit `.env`. A committed `.env.example` lists names only, never values.

---

## Group A — Day 0 (must have before starting)

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| GitHub repo (empty, private) | Code home + CI | github.com/new | `https://github.com/thequantcoder/VOCAL-IQ` (tell Claude the URL) |
| Local folder path | Where code is saved on your Mac | your filesystem | `/Users/saransh/Documents/VOCAL-IQ` (tell Claude the path) |
| Node.js 20 LTS + pnpm | Run the monorepo | nodejs.org / `npm i -g pnpm` | — |
| Python 3.12 | Voice service | python.org (you use `python3`) | — |
| Docker Desktop | Local Postgres/Redis/LiveKit | docker.com | — |
| Secrets manager (Doppler) | Hold keys safely | doppler.com (free tier) | `DOPPLER_TOKEN` |

---

## Group B — Phase 0–1 (Days 1–16): core auth, DB, first AI call

| Item | Why | Where / plan | Env var(s) |
|------|-----|--------------|-----------|
| **Supabase** project (or managed Postgres 16) | Primary DB (+ pgvector, RLS) | supabase.com — Pro recommended once live | `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Upstash Redis** (or managed Redis) | Cache, queues, pub/sub | upstash.com (free tier to start) | `REDIS_URL` |
| **Cloudflare** account | DNS, CDN, R2 storage, custom domains | cloudflare.com | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| **Cloudflare R2** bucket | Recordings, uploads, exports | CF dashboard → R2 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` |
| **Auth provider** — Clerk (recommended) | Auth, sessions, MFA, orgs | clerk.com (free tier) | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| **Twilio** | PSTN numbers, outbound/inbound, SMS | twilio.com — add billing | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **LiveKit Cloud** | Real-time media (WebRTC) for the voice loop | livekit.io/cloud | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| **Deepgram** | Streaming speech-to-text | deepgram.com | `DEEPGRAM_API_KEY` |
| **ElevenLabs** | Text-to-speech + voices | elevenlabs.io — Creator+ plan | `ELEVENLABS_API_KEY` |
| **OpenAI** | LLM + embeddings (+ Realtime later) | platform.openai.com | `OPENAI_API_KEY` |
| **Anthropic** | LLM (Claude) for high-quality convo + QA | console.anthropic.com | `ANTHROPIC_API_KEY` |
| **Stripe** | Subscriptions + metered billing | stripe.com | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Sentry** | Error tracking | sentry.io (free) | `SENTRY_DSN` |
| **PostHog** | Product analytics | posthog.com (free) | `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_HOST` |
| **Resend** | Transactional email | resend.com | `RESEND_API_KEY` |

> **Decisions to make in this phase (Claude will ask if unset):**
> - App name + final brand (placeholder = "VocalIQ").
> - Default base currency (e.g. USD or INR).
> - Initial plan tiers & prices (a starting ladder is in the blueprint §11; you can adjust later in the plan builder).

---

## Group C — Phase 2–2.5 (Days 17–40): builder, RAG, more providers, SIP, Google

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| **Google Gemini** | Cheap/fast bulk LLM + classification | aistudio.google.com | `GEMINI_API_KEY` |
| **xAI Grok** (optional) | Routing redundancy / tenant choice | x.ai/api | `XAI_API_KEY` |
| **OpenRouter** (optional) | One key fronting many models | openrouter.ai | `OPENROUTER_API_KEY` |
| **PlayHT** (optional TTS) | TTS redundancy | play.ht | `PLAYHT_API_KEY`, `PLAYHT_USER_ID` |
| **Cartesia** (optional TTS) | Ultra-low-latency TTS | cartesia.ai | `CARTESIA_API_KEY` |
| **AssemblyAI** (optional STT) | STT alternative + audio intelligence | assemblyai.com | `ASSEMBLYAI_API_KEY` |
| **Qdrant** (optional, at scale) | Vector DB beyond pgvector | qdrant.tech / cloud | `QDRANT_URL`, `QDRANT_API_KEY` |
| **Google Cloud project** (OAuth) | Calendar + Sheets two-way sync | console.cloud.google.com | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| **Telnyx** (optional telephony) | Cheaper numbers / global | telnyx.com | `TELNYX_API_KEY` |
| **SIP trunk** (your choice of carrier) | BYO-SIP engine testing | Twilio/Telnyx/Plivo/etc. | per-trunk creds (stored encrypted in DB, not env) |

---

## Group D — Phase 3 (Days 41–50): messaging, more gateways, ops

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| **WhatsApp Business / Cloud API** | Post-call follow-ups, messaging campaigns | developers.facebook.com (or Twilio WA) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN` |
| **PayPal** | Extra payment gateway | developer.paypal.com | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` |
| **Razorpay** (India) | Regional gateway | razorpay.com | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| **Paystack** (Africa) | Regional gateway | paystack.com | `PAYSTACK_SECRET_KEY` |
| **MercadoPago** (LATAM) | Regional gateway | mercadopago.com | `MERCADOPAGO_ACCESS_TOKEN` |
| **Dodo Payments** | Merchant-of-record option | dodopayments.com | `DODO_API_KEY` |
| **Zapier / Make** (optional) | Automation hooks for tenants | zapier.com / make.com | tenant-provided, not env |

---

## Group E — Phase 4–5 (Days 51–66): white-label domains, enterprise

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| **Cloudflare for SaaS** (custom hostnames) | Reseller custom domains + SSL | CF dashboard → SSL/TLS → Custom Hostnames | `CLOUDFLARE_SAAS_ZONE_ID` |
| **WorkOS** (or Clerk Enterprise) | SSO/SAML for enterprise tenants | workos.com | `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` |
| **Production host** — Railway/Render → AWS/GCP | Deploy API, voice, workers | railway.app etc. | host-specific |
| **Vercel** | Deploy Next.js web | vercel.com | `VERCEL_TOKEN` (CI) |
| **Compliance** (when pursuing) | SOC 2 / HIPAA / PCI / GDPR | Vanta/Drata + auditor | — (process, not a key) |
| **Domain registrar** | Primary platform domain | your registrar | — |

---

## Group F — Core-tier additions & Phase 6 advanced features (Days 69–94)

**Core-tier (set up early — Days 69–72):**

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| **STIR/SHAKEN + Branded Caller ID** | Avoid "Scam Likely"; protect answer rates | Twilio/Telnyx (business verification + CNAM/RCD) | provider-side config + `CNAM_*` if applicable |
| **Number reputation monitoring** | Detect spam-flagged numbers | Provider API or a reputation service | `NUMBER_REPUTATION_API_KEY` |
| **Marketing email domain** | Email campaigns (separate from transactional) | Your domain + SPF/DKIM/DMARC; Resend | reuses `RESEND_API_KEY` + verified domain |

**Phase 6 advanced (set up per feature you build — Days 73–94):**

| Item | Why | Where | Env var(s) |
|------|-----|-------|-----------|
| Fine-tuning-capable LLM access | Custom per-tenant models (#76) | OpenAI/Together/etc. | reuses LLM keys + fine-tune access |
| PCI-compliant payment capture partner | Pay-by-voice (#78) | Stripe + secure DTMF capture partner | `PCI_CAPTURE_*` (partner-specific) |
| Voice-biometrics provider | Voiceprint verification (#91) | Pindrop/Nuance-class or model | `VOICE_BIOMETRICS_API_KEY` |
| Real-time avatar/video provider | Digital human agents (#92) | HeyGen / D-ID / Tavus-class | `AVATAR_PROVIDER_API_KEY` |
| Translation-capable model | Real-time translation (#88) | LLM/translation API (reuse) | reuses LLM keys |
| Telegram Bot API | Telegram channel (#93) | t.me/BotFather | `TELEGRAM_BOT_TOKEN` |
| Meta Business (Messenger/Instagram) | Messenger/IG channels (#93) | developers.facebook.com | `META_PAGE_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` |
| RCS provider | RCS messaging (#93) | via Twilio/Sinch RCS | `RCS_*` (provider-specific) |
| Data warehouse (optional) | Analytics API exports (#87) | Snowflake/BigQuery | `WAREHOUSE_*` (usually customer-side) |

> **Decisions/compliance to confirm in this tier:**
> - **PCI scope** for pay-by-voice (#78) — who holds PCI responsibility; use a capture partner so card data never enters your systems.
> - **Biometric legality** (#91) — voice biometrics is heavily regulated (e.g. BIPA in Illinois, GDPR special-category data); confirm per region + capture explicit consent.
> - **AI disclosure rules** (#71) per target region.
> - **Avatar likeness consent** (#92) for any cloned/likeness-based avatar.
> - **Anonymization opt-in** for peer benchmarking (#86).

---

## How Claude will use this

- On any day, if a needed key isn't in `.env`/secrets, Claude emits the `🔑 ADMIN ACTION REQUIRED` block (see `CLAUDE.md §7`) naming the item, URL, plan, scopes, and env var — drawn from this file.
- You can pre-load a whole group before its phase to avoid interruptions.
- Test/sandbox keys are fine for development; swap to live keys before production days in Phase 4–5.

---

## Cost note

Most providers have free tiers or pay-as-you-go. Real money starts flowing when you place live calls (telephony + TTS + LLM minutes). Keep test volumes small until billing + cost-attribution (Phase 1) is verified, so you always see what each call costs.
