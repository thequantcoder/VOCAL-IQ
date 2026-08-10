# CLAUDE.md — VocalIQ Master Operating File

> This file is read automatically by Claude Code at the start of every session.
> It is the single source of truth for **how** to build VocalIQ. Read it fully before writing any code.
> When in doubt, prefer the rules here over your own defaults.

---

## 0. What VocalIQ is (one paragraph)

VocalIQ is a multi-tenant, white-label **Agentic Voice AI SaaS** platform. Businesses design AI voice agents (in a visual node builder), deploy them on phone numbers / web / SIP, run inbound + outbound calls and campaigns in many languages and voices, capture leads and book appointments, and analyse every call. The platform is sold **direct**, via **resellers** (white-label sub-tenants with their own pricing/markup), and via a **metered API**. The full product spec lives in the blueprint (`VocalIQ-Voice-AI-SaaS-Blueprint-v1.2.docx`) and is summarised across the reference `.md` files in this kit.

---

## 0.1 ⚑ PROJECT LOCATION & GIT DISCIPLINE (non-negotiable — read first)

**Local code location (the ONLY place code is saved):**
```
/Users/saransh/Documents/VOCAL-IQ
```
- ALL VocalIQ source — frontend, backend, voice service, workers, packages, infra, configs, everything — is created and saved **inside `/Users/saransh/Documents/VOCAL-IQ`**. Never write project code anywhere else. On Day 0 this folder is initialised as the git repo root.

**GitHub remote (the ONLY remote):**
```
https://github.com/thequantcoder/VOCAL-IQ
```

**Auto-commit-and-push rule (after EVERY change — small or big):**
After every meaningful change — completing a day, finishing a module, a bug fix, a refactor, a doc update, ANY modification — Claude must **automatically `git add` → `git commit` (with a clear, descriptive message) → `git push`** to `https://github.com/thequantcoder/VOCAL-IQ`, following `GIT-WORKFLOW.md`. Do not wait to be asked. Do not batch a whole day into one giant commit — commit each logical increment, and always push so the remote is never behind local.

- Commit messages follow the Conventional-Commits format in `GIT-WORKFLOW.md` and reference the day.
- Never push secrets or `.env` (only `.env.example`).
- A change is not "done" until it is committed **and pushed** and the remote reflects it.
- If a push fails (auth/network), stop and tell the admin exactly what's needed; never silently leave work unpushed.

> In short: **code lives only in `/Users/saransh/Documents/VOCAL-IQ`, and every change is auto-committed + pushed to `https://github.com/thequantcoder/VOCAL-IQ` with a proper description — automatically, every time.**

---



---

## 1. The golden rules (never violate)

1. **Multi-tenancy is sacred.** Every table, query, cache key, file path, and API route is scoped to a `tenantId`. There is **no** un-scoped data access. Resellers own sub-tenants; a reseller can never see another reseller's data. Enforce with Postgres Row-Level Security (RLS) **and** application-layer guards. This is the most expensive thing to retrofit — get it right from Day 1.
2. **Provider-agnostic by routing.** Never hard-wire a single LLM / TTS / STT / telephony vendor. All provider calls go through the **Provider Routing Layer**. Adding a new provider must be a config change, not a code rewrite.
3. **BYOK and managed must both work.** A tenant either brings their own keys (thin platform fee) or consumes platform credits (marked-up minutes). Every provider call checks which mode applies and uses the right key + meters cost accordingly.
4. **Measure cost on every call.** Per-call cost (STT + LLM + TTS + telephony) is attributed to the tenant (and reseller margin computed) in real time. Never ship a calling path without cost attribution.
5. **Security is not a phase.** Secrets are never in code or logs. Provider keys are encrypted at rest (KMS/envelope encryption). Webhooks are signature-verified. Inputs are validated with Zod (TS) / Pydantic (Py). RBAC is enforced on every mutation.
6. **Never break a working feature.** Before editing shared code, search for all call sites. Add tests. If a change is risky, isolate it behind a flag.
7. **Stop and ask only when truly blocked.** If a required credential, decision, or secret is missing, pause and tell the admin exactly what is needed (see §7). Otherwise proceed using the documented defaults.

---

## 2. Daily workflow (follow this loop every single day)

Each "day" = one super-prompt file in `super-prompts/` (e.g. `super-prompts/DAY-07-...md`). For each day:

1. **Read the day file fully**, plus any files it lists under *Prerequisites* and *Context to load*.
2. **Confirm prerequisites.** If the day needs a credential/account/key that the admin hasn't provided, check `.env` and the secrets store. If missing, **stop and request it** in the exact format of §7. Do not fake keys or stub around a missing decision silently.
3. **Restate the plan** in 3–6 bullets (what files, what modules, what tests) before coding. Keep it tight.
4. **Build** in small commits-worth of increments. Write the code, then the tests, then run them.
5. **Run the full local check**: typecheck, lint, unit tests, and (where relevant) integration/e2e for the touched area. Everything must pass.
6. **Run the Self-Audit** (`SELF-AUDIT-PROTOCOL.md`) — the full checklist, written out, with honest findings and fixes applied.
7. **Commit & push (automatic, every increment)** per `GIT-WORKFLOW.md` to `https://github.com/thequantcoder/VOCAL-IQ` with a clear, descriptive message. One logical change per commit; multiple commits per day is expected. **Always push** — never leave the remote behind local. Do this without being asked.
8. **Update the day log**: append a short entry to `BUILD-LOG.md` (create it on Day 0) — what was built, decisions made, anything deferred, anything the admin must do next.
9. **Report** to the admin: a 5–10 line summary, the commit hash(es), test results, and any new prerequisites for the next day.

> **Never** mark a day "done" if typecheck, lint, or tests fail, or if the self-audit found an unaddressed issue.

---

## 3. Where things live (repo layout)

The repository is a **Turborepo monorepo**. Exact tree is in `ARCHITECTURE.md §Repo layout`. Top level:

```
vocaliq/
├─ apps/
│  ├─ web/            # Next.js 15 — tenant dashboard, builder, admin, reseller, agent desk
│  ├─ api/            # NestJS — app API (auth, tenancy, billing, agents CRUD, analytics)
│  ├─ voice/          # Python FastAPI + Pipecat/LiveKit — real-time call loop
│  └─ workers/        # BullMQ workers (campaigns, transcription, scoring, webhooks)
├─ packages/
│  ├─ db/             # Prisma schema + migrations + generated client
│  ├─ shared/         # shared TS types, Zod schemas, constants, utils
│  ├─ provider-router/# LLM/TTS/STT/telephony abstraction
│  ├─ ui/             # shared React components (shadcn-based)
│  └─ config/         # eslint, tsconfig, tailwind preset
├─ infra/             # Terraform, docker-compose, deployment
├─ docs/              # the .md kit lives here (this file at root + copy here)
└─ .github/workflows/ # CI
```

The project's **local MacBook path** and **GitHub repo** are fixed (see §0.1 below): all code lives at `/Users/saransh/Documents/VOCAL-IQ` and pushes to `https://github.com/thequantcoder/VOCAL-IQ`.

---

## 4. Tech stack (summary — full detail in `TECH-STACK.md`)

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · React Flow (xyflow) · TanStack Query/Table · Zustand · Framer Motion · Recharts.
- **App backend:** Node.js · NestJS · Prisma · PostgreSQL 16 (+ TimescaleDB, pgvector) · Redis · BullMQ · Socket.IO.
- **Voice service:** Python 3.12 · FastAPI · Pipecat · LiveKit Agents · Celery.
- **AI orchestration:** LangGraph + LangChain behind the Provider Router.
- **Infra/DevOps:** Docker · Turborepo · GitHub Actions · Terraform · Cloudflare · Vercel (web) · Railway/Render → AWS/GCP at scale · Sentry · Prometheus/Grafana · PostHog.

Pin versions exactly as in `TECH-STACK.md`. Do not upgrade majors mid-build without a note in `BUILD-LOG.md`.

---

## 5. Code quality bar (summary — full detail in `CODING-RULES.md`)

- **TypeScript strict everywhere.** No `any` (use `unknown` + narrowing). No non-null `!` without justification.
- **Validate all boundaries.** Zod at every API input/output and env parse; Pydantic in the voice service.
- **Small, pure, testable units.** Functions do one thing. Side-effects isolated. Dependency-inject providers.
- **Errors are typed and handled.** No silent catches. User-facing errors never leak internals.
- **Every feature ships with tests.** Unit for logic, integration for API + DB, e2e (Playwright) for critical flows.
- **Comments explain *why*, not *what*.** Public functions get a short doc comment.
- **No dead code, no TODOs left dangling.** If deferring, log it in `BUILD-LOG.md` with a tracked note.
- **Accessibility + responsiveness** for all UI; dark mode from the start; respect the design tokens in `packages/ui`.

---

## 6. Self-audit (summary — full protocol in `SELF-AUDIT-PROTOCOL.md`)

After **every** day, run the written self-audit covering: correctness, tenant-isolation, security, cost-attribution, tests, performance/latency, error handling, accessibility, and "did I break anything." Output the audit as a short report, fix everything findable, re-run checks, then commit. The audit is mandatory — a day is not complete without it.

---

## 7. When you need something from the admin (exact format)

Whenever a prerequisite is missing, stop and emit a block exactly like this, then wait:

```
🔑 ADMIN ACTION REQUIRED — Day {{N}} cannot proceed without:
1. {{What}} — {{why it's needed}} — {{where to get it}} — {{which env var / secret name to set}}
2. ...
Once set in {{.env / secrets manager}}, reply "continue" and I'll resume.
```

Be specific: name the provider, the exact signup URL, the plan to choose, the scopes/permissions, and the env var name. The full list of every credential the project will ever need is pre-collected in `PREREQUISITES.md` so the admin can set them up in advance.

---

## 8. Models: when to use Opus vs Sonnet (you will be run as both)

- **Use Opus** for: architecture decisions, the Provider Router, the multi-tenant data model, the voice real-time loop, billing/metering logic, security-sensitive code, multi-agent orchestration, and any day marked `🧠 OPUS` in its header.
- **Use Sonnet** for: CRUD endpoints, standard UI components, straightforward integrations, tests, copy, config, and any day marked `⚡ SONNET`.
- Each day file states the recommended model in its header. If a Sonnet day uncovers an architectural fork, pause and recommend escalating to Opus rather than guessing.

---

## 9. Hard "do nots"

- ❌ Don't use `localStorage`/`sessionStorage` in artifacts/previews; use React state or the DB.
- ❌ Don't store secrets in the repo, in client bundles, or in logs.
- ❌ Don't write provider-specific code outside `packages/provider-router`.
- ❌ Don't add a calling path without cost metering + tenant scoping.
- ❌ Don't merge with failing CI, skipped tests, or an incomplete self-audit.
- ❌ Don't invent third-party API behaviour — if unsure, read the official docs (fetch them) before coding.
- ❌ Don't write malware, scrapers that violate ToS, or anything that enables call spam/abuse; build the anti-abuse controls instead.

---

## 10. File index of this kit

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This master file (how to build). |
| `00-START-HERE.md` | Orientation + first-session checklist. |
| `PREREQUISITES.md` | Every account, API key, and admin action, grouped by phase. |
| `TECH-STACK.md` | Exact stack, versions, and per-package rationale. |
| `ARCHITECTURE.md` | System design, repo layout, service boundaries, data flow. |
| `DATA-MODEL.md` | Multi-tenant schema, entities, RLS strategy. |
| `CODING-RULES.md` | Coding standards and quality bar. |
| `CODE-PATTERNS.md` | Canonical copy-me implementation patterns (use these every day). |
| `DESIGN-SYSTEM.md` | Visual identity, motion, UX, onboarding & senior-FE standards (read on every UI day). |
| `SELF-AUDIT-PROTOCOL.md` | The mandatory after-every-day audit. |
| `GIT-WORKFLOW.md` | Branching, commit format, push discipline. |
| `PROMPT-INDEX.md` | Ordered list of all day super-prompts + phase map. |
| `super-prompts/DAY-XX-*.md` | The day-by-day build prompts (00–94). |
| `BUILD-LOG.md` | Running log (you create + append daily). |

> Start at `00-START-HERE.md`.

---

## 11. Build sequence — what to build first, next, and why (READ THIS)

Build **strictly in this order** unless a day file says otherwise. Each phase depends on the previous one's core being green. Never start a feature whose prerequisites aren't done.

**Phase 0 — Foundations (Days 0–6): the bedrock. Do not skip or reorder.**
`00 scaffold → 01 CI/Docker → 02 shared types → 03 auth → 04 data model + RLS → 05 RBAC + isolation tests → 06 provider-router skeleton + first AI call`
> Day 04 (multi-tenant schema) is the single most important day — everything keys off it. Never rush it.

**Phase 1 — Core calling MVP (Days 7–16):**
`07 router core → 08 voice skeleton → 09 live loop → 10 outbound → 11 inbound → 12 recording/transcription → 13 cost attribution → 14 first dashboard → 15 billing → 16 web widget`
> 🔴 Slot **Day 69 (caller reputation/STIR-SHAKEN)** here, right after Day 10, before any real outbound volume.

**Phase 2 — Builder & conversations (Days 17–30):**
`17 canvas → 18 core nodes → 19 tool/webhook → 20 RAG → 21 collect/transfer/sub-flow → 22 compiler → 23 test panel → 24 persona/templates → 25 multilingual → 26 voices/cloning → 27 Squads → 28 campaigns → 29 lead workspace → 30 A/B`
> 🔴 Slot **Day 67 (Agent Desk)** right after Day 27 (transfers need a destination). Lay **Day 68 (i18n)** foundation anytime after Day 01.

**Phase 2.5 — Lead intel, testing, telephony (Days 31–40):**
`31 post-call intel → 32 simulator → 33 batch testing → 34 memory → 35 SIP → 36 appointments → 37 sheets/forms → 38 cost protection → 39 transcription controls → 40 integrations`
> 🔴 Slot **Day 70 (fraud/abuse)** and **Day 71 (AI disclosure)** within this phase.

**Phase 3 — Analytics, multi-channel, polish (Days 41–50):**
`41 analytics → 42 search → 43 QA scoring → 44 messaging → 45 multimodality → 46 MCP → 47 marketplace/automations → 48 public API/SDK → 49 ops toolkit → 50 onboarding/polish`
> 🔴 Slot **Day 72 (email campaigns)** alongside Day 44.

**Phase 4 — White-label & reseller (Days 51–58):**
`51 reseller hierarchy → 52 custom domains/theming → 53 wallet/markup engine → 54 reseller portal → 55 super-admin → 56 plan builder → 57 key vault → 58 flags/quotas/audit`

**Phase 5 — Scale & enterprise (Days 59–66):**
`59 SSO/SAML → 60 compliance → 61 on-prem/VPC → 62 scale infra → 63 latency hardening → 64 security hardening → 65 mobile/S2S → 66 launch readiness`
> **This completes a sellable v1.0.** Tag it. Get customers. Then proceed to Phase 6.

**Phase 6 — Advanced / differentiators (Days 73–94):** build the subset that fits your market, in roughly the listed order; `94` integrates + hardens + launches the advanced tier last.

> The canonical table with models + timing is in `PROMPT-INDEX.md`. If you ever deviate from this order, record why in `BUILD-LOG.md`.

---

## 12. Per-day admin credential map (what the admin must provide, by day)

At the **start of each day**, confirm these are in `.env`/secrets. If missing, emit the `🔑 ADMIN ACTION REQUIRED` block (§7). Full URLs/plans/scopes are in `PREREQUISITES.md`.

| Day(s) | Admin must have ready |
|--------|----------------------|
| 00 | GitHub repo URL, local path, Node 20, pnpm, Python 3.12, Docker, (Doppler) |
| 01 | (Sentry, PostHog optional) |
| 02 | — (none) |
| 03 | Clerk keys + chosen auth methods |
| 04 | `DATABASE_URL`, `DIRECT_URL` (Postgres 16 + timescaledb + pgvector); base currency + plan tiers decision |
| 05 | — |
| 06 | `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` |
| 07 | `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, Twilio creds, LiveKit creds |
| 08–09 | LiveKit + STT/TTS/LLM keys (from Day 7) |
| 10 | Twilio number + test budget + a test phone number |
| 11 | A Twilio number pointed at the platform webhook; public dev URL (tunnel) or staging |
| 12 | `R2_*` keys; recording-consent policy decision |
| 13 | confirm provider price tables (re-check current rates) |
| 14 | — |
| 15 | Stripe keys + webhook secret; confirm plan ladder |
| 16 | LiveKit (web widget) |
| 17–18 | — |
| 19 | an HTTP endpoint to test webhooks (mock fine) |
| 20 | embeddings key (OpenAI or chosen); pgvector (from Day 4) |
| 21–24 | — |
| 25 | TTS/STT providers for target languages; confirm language list |
| 26 | ElevenLabs (cloning-capable plan); consent process decision |
| 27 | — |
| 28 | — (workers running) |
| 29–34 | (34) confirm retention/privacy defaults |
| 35 | a SIP trunk + credentials; (optional) ElevenLabs SIP / OpenAI Realtime SIP access |
| 36–37 | Google Cloud OAuth (`GOOGLE_OAUTH_CLIENT_ID/SECRET`) + Calendar/Sheets scopes; consent screen |
| 38–43 | — |
| 44 | WhatsApp Cloud API (`WHATSAPP_*`) and/or Twilio SMS; approved templates |
| 45–47 | — |
| 48 | — |
| 49 | Stripe + number provisioning |
| 50 | — |
| 51 | — |
| 52 | Cloudflare for SaaS (`CLOUDFLARE_SAAS_ZONE_ID`) |
| 53 | Stripe Connect/rebilling decision |
| 54–56 | — |
| 57 | KMS for envelope encryption |
| 58 | — |
| 59 | WorkOS (`WORKOS_*`) or Clerk Enterprise |
| 60 | legal/compliance decisions per region |
| 61 | Terraform; target cloud(s) |
| 62 | cloud accounts for ClickHouse/Qdrant/K8s |
| 63–64 | (optional external pen test) |
| 65 | mobile decision; speech-to-speech provider access |
| 66 | production accounts + live keys + domain |
| 67 | — (Agent Desk; uses existing infra) |
| 68 | target locales + RTL decision |
| 69 | STIR/SHAKEN + branded caller ID setup; `NUMBER_REPUTATION_API_KEY` |
| 70 | — |
| 71 | confirm target regions + disclosure rules |
| 72 | marketing email domain (SPF/DKIM/DMARC) |
| 73–75 | — |
| 76 | fine-tuning-capable LLM access; consent |
| 77 | expressive-TTS-capable provider |
| 78 | PCI-compliant capture partner (`PCI_CAPTURE_*`); confirm PCI scope |
| 79–80 | — |
| 81–82 | — |
| 83–84 | (payments/wallet from Day 53) |
| 85–87 | (87: optional warehouse creds) |
| 88 | translation-capable model (reuse LLM keys) |
| 89–90 | — |
| 91 | voice-biometrics provider (`VOICE_BIOMETRICS_API_KEY`); confirm biometric legality + consent |
| 92 | real-time avatar provider (`AVATAR_PROVIDER_API_KEY`); likeness consent |
| 93 | Telegram/Meta/RCS channel credentials |
| 94 | — (all chosen Phase 6 keys already set) |

> Pre-load a phase's credentials a day ahead (groups in `PREREQUISITES.md`) so the build never stalls.

---

## 13. Always use the canonical patterns

Before writing tenant queries, provider calls, webhooks, cost metering, or RLS tests, **read `CODE-PATTERNS.md`** and use the patterns there verbatim (adapted to context). This guarantees every day's code is consistent, secure, and correct on the cross-cutting concerns. Deviating from a pattern requires a note in `BUILD-LOG.md`.

---

## 14. Definition of "perfection" for a day (the bar to clear)

A day is built to perfection only when ALL are true:
- Every **Definition of Done** item in the day file is met and demonstrated.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (and `pytest` for voice) are **green**.
- The **self-audit (A–K)** is written out, with all findable issues fixed.
- **Tenant isolation** holds (the isolation test passes; new tables have RLS).
- **Every provider call meters cost** (no unmetered path).
- **No secret in code/logs/client**; webhooks verified; inputs validated.
- The feature is **demonstrated working** (describe the manual check you ran).
- It's **committed + pushed** with the structured message and `BUILD-LOG.md` updated.

If any is false, the day is not done — keep working or escalate to the admin. Never report a day complete otherwise.

---

## 15. If a third-party API behaves unexpectedly

Vibe-coding fails when you guess an API. So: **fetch and read the official docs** for any provider before coding against it (endpoints, auth, streaming format, webhook signature, rate limits). If behaviour is ambiguous, write a tiny sandbox spike, confirm the real shape, then build. Pin SDK versions per `TECH-STACK.md`. If a provider's real behaviour differs from this kit's assumptions, follow the provider and note the discrepancy in `BUILD-LOG.md`.
