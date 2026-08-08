# Global Messaging Engine (GME) — Master Plan & Day-by-Day Super-Prompts

> **Module goal.** Turn VocalIQ's basic messaging seam into an **advanced, smart, multi-provider
> SMS engine + rich RCS**, with **BYOK per-tenant keys**, **unified billing (UsageRecord + reseller
> markup)**, and a **consent-driven "call → follow-up message" automation** so the whole loop —
> inbound AI call → conversation → in-call consent → SMS/WhatsApp/RCS follow-up — lives on our platform.
>
> **Decisions locked (2026-08-08):** ① India **and** global providers in parallel waves ·
> ② **Full rich RCS** (Google RBM + CPaaS) · ③ **BYOK per-tenant vault + platform-managed fallback** ·
> ④ **Meter every message into `UsageRecord`** (wallet debit + plan quota + reseller margin).
>
> **Prefix:** `GME-XX`. We execute **one day at a time** from this file (like the WAC/MEC modules).
> Follow `CLAUDE.md` on every day: multi-tenancy sacred, provider-agnostic routing, BYOK+managed,
> cost on every call, security-first, tests+self-audit, auto commit+push via the `/tmp` workflow.

---

## 0. Current state (from a full code audit — do not rebuild these)

**Solid today** (`apps/api/src/messaging/`):
- `MessageSender` interface + `buildSenders(env)` factory (`senders.ts`). Channels: WhatsApp Cloud,
  Twilio SMS, Telegram, Messenger, Instagram, RCS (text stub), Email (stub).
- `messaging.service.ts` — template CRUD, `send()`, inbound classification, opt-out; `messaging.routes.ts`
  — REST + per-tenant webhook routes; `webhook-verify.ts` — **constant-time** HMAC (SHA-1/256) per channel.
- Shared logic `packages/shared/src/messaging.ts` — `MessageChannel`/`Direction`/`Status` enums, SMS
  segmentation + per-channel `messageCostUsd`, `{{var}}` template render, STOP/START classify.
- DB (`schema.prisma`): `Message` (585-630), `MessageTemplate` (585-604), `MessagingOptOut` (632-642),
  enums (166-188), `Contact` (765-794, has `dnc` + email consent), `ConsentRecord` (2128-2140),
  `Suppression` (2142-2154).
- Automations (`apps/api/src/automations/`): `ACTION_TYPES` includes **`send_message`** (WHATSAPP|SMS)
  with a working executor → `messaging.send()`; events `['call_ended','disposition_set','lead_status_changed']`.

**Gaps this module fills:**
1. **SMS = Twilio only.** No multi-provider, no smart routing, no failover, no India DLT, no sender-ID pools.
2. **RCS = text-only generic-gateway stub.** No rich cards/carousels/suggested-replies/media/branding.
3. **Keys = env-var only.** No per-tenant BYOK vault (LLM/TTS use encrypted `ProviderCredential`; messaging doesn't).
4. **Cost is local** (`Message.costUsd`), **not** in `UsageRecord` → no wallet debit / plan quota / reseller margin.
5. **Sends are synchronous** (8 s inline) — no queue, retry, fallback, batching, or webhook-replay idempotency.
6. **Call-end does NOT auto-dispatch automations/workflows** — `recordDisposition` runs form-extraction + webhook
   only; visual **workflow** builder's `WORKFLOW_ACTION_TYPES` lacks `send_message`.
7. **No SMS/WhatsApp/RCS consent fields** on `Contact`; `messaging.send()` checks `MessagingOptOut` but **not**
   `Suppression`/DNC or call-origin consent.

---

## 1. Target architecture

```
                         ┌─────────────────────────────────────────────────────────┐
   in-call consent ──►   │  Contact.channelConsent + ConsentRecord (basis, region)  │
   (voice agent node)    └─────────────────────────────────────────────────────────┘
                                              │
 call ends ─► recordDisposition ─► dispatch(call_ended) ─► Automations + Workflow engine
                                              │  action: send_message {channel|cascade, template}
                                              ▼
                    ┌──────────────────────── MessagingService.send() ───────────────────────┐
                    │  GATE: consent ✓  · opt-out ✓  · Suppression/DNC ✓  · quiet-hours ✓     │
                    │        · rate/velocity ✓  · DLT (India) ✓                                │
                    └──────────────────────────────┬─────────────────────────────────────────┘
                                                   ▼  enqueue
                       ┌──────────────── BullMQ  message-sender worker ───────────────┐
                       │  SmartRouter.pick(channel,country,tenant)                     │
                       │    least-cost · per-country/prefix · health/eject · failover  │
                       │  KeyVault.resolve(tenant,provider)  (BYOK ▸ managed)          │
                       │  Adapter.send() ─► provider API ─► providerMessageId           │
                       │  meter ─► UsageRecord (tenant cost + reseller margin) + wallet │
                       │  persist Message(status) · retry/backoff · fallback chain      │
                       └──────────────────────────────┬───────────────────────────────┘
                                                   ▼  async
                        provider DLR webhook ─► normalizeDlr() ─► Message.status  (idempotent)
                        provider inbound webhook ─► STOP/START + rich reply parse
```

**Key building blocks (new):**
- **`packages/provider-router` gains a messaging capability** OR a sibling `packages/messaging-router`
  (decide GME-00) exposing `SmsProvider` / `RcsProvider` interfaces + a **registry** + a **SmartRouter**.
  Rationale: keep the golden rule "provider-agnostic by routing" — adding a provider = config + one adapter.
- **`SmsProvider` contract:** `id`, `send(msg, key) → {providerMessageId, status, error?}`,
  `normalizeDlr(payload) → {providerMessageId, status}`, `parseInbound(payload)`, `verify(sig, raw, secret)`,
  `capabilities` (unicode, longSMS, senderIdTypes, dlrSupport), `countries` (coverage/coverage-hint).
- **`RcsProvider` contract:** superset — `sendRich(card|carousel|suggestions|media)`, `capabilityCheck(msisdn)`
  (RCS-capable?), `smsFallback`, `typingIndicator`, `readReceipt`, branding/agent-id.
- **KeyVault (messaging):** per-tenant encrypted `ProviderCredential` rows (reuse `apps/api/src/crypto/envelope.ts`),
  resolver picks BYOK if present else platform-managed; records which was used (for billing: BYOK = thin fee).
- **SmartRouter:** routing-rules model (per tenant/country/channel) + engine: least-cost, country/prefix
  preference, provider-health ejection (reuse the Day-38 key-pool health idea), sticky sender-ID.
- **BullMQ `message-sender` worker** (`apps/workers/`): dequeue → route → send → meter → persist → on-fail
  retry/backoff → exhaust → next provider in fallback chain → dead-letter after N.
- **Unified metering:** `UsageRecord` per message (`kind='sms'|'rcs'|'whatsapp'`), tenant cost + reseller
  margin via the existing cost/wallet/reseller services.
- **DLT engine (India):** entity/principal-entity IDs, header (sender-ID) registry, DLT template IDs, per-message
  DLT stamping + pre-send validation; block non-compliant sends.

**Cross-cutting rules (every day):** tenant-scope every row/query/webhook path; meter cost on every send
(no unmetered path); BYOK keys envelope-encrypted, never logged; webhooks signature-verified + idempotent;
Zod at every boundary; STOP/HELP + quiet-hours + rate caps enforced server-side; tests + A–K self-audit;
commit+push each increment via `/tmp`.

---

## 2. Provider matrix (target ~15; adapters land across GME-05/07/08/09/10/12)

| # | Provider | Region | SMS | RCS | Notes / creds (BYOK or managed) |
|---|----------|--------|-----|-----|---------------------------------|
| 1 | **Twilio** | Global | ✅ (exists) | via RBM | already wired; extend to registry + DLR normalize |
| 2 | **Vonage** (Nexmo) | Global | ✅ | — | API key/secret |
| 3 | **Plivo** | Global | ✅ | — | **reuse** existing telephony creds (Plivo carrier already built) |
| 4 | **Telnyx** | Global | ✅ | — | **reuse** existing Telnyx creds (carrier already built) |
| 5 | **Sinch** | Global | ✅ | ✅ RBM | strong RCS; service-plan id + token |
| 6 | **MessageBird / Bird** | Global | ✅ | ✅ | access key |
| 7 | **Infobip** | Global/EMEA | ✅ | ✅ | base-url + api-key |
| 8 | **AWS SNS** | Global | ✅ | — | IAM keys / role |
| 9 | **Bandwidth** | US | ✅ | ✅ | account + app id |
| 10 | **MSG91** | India | ✅ | ✅ | India DLT-native; authkey + sender + DLT template id |
| 11 | **Gupshup** | India | ✅ | ✅ | apikey; DLT; also WhatsApp BSP |
| 12 | **Kaleyra** | India/Global | ✅ | ✅ | sid + api-key; DLT |
| 13 | **Route Mobile / ValueFirst** | India | ✅ | — | India DLT |
| 14 | **Fast2SMS** | India | ✅ | — | budget India; authorization key |
| 15 | **Textlocal / 2Factor** | India | ✅ | — | OTP-heavy India |
| — | **Google RCS Business Messaging** | Global | — | ✅ (native) | agent + service-account (rich cards/carousels/suggestions) |

> Coverage/priority is data-driven at runtime via SmartRouter rules (per-country default provider),
> so the day order below is about *building adapters*, not hard-wiring routes.

---

## 3. Phased roadmap (GME-00 … GME-20)

- **Phase A — SMS engine core** (GME-00..04): abstraction, BYOK vault, async pipeline, smart router, billing.
- **Phase B — Provider adapters** (GME-05,07,08,09,10) + **DLT** (GME-06): the 14 providers + India compliance.
- **Phase C — Rich RCS** (GME-11..13): rich engine, RBM/CPaaS adapters, rich-message builder UI.
- **Phase D — Consent-driven automation** (GME-14..17): consent capture, unified gate, call-end wiring, campaigns.
- **Phase E — Ops/UI/analytics/hardening** (GME-18..20): config UI, deliverability dashboard, anti-abuse + launch.

Each day below is a **self-contained super-prompt**. Model tag: 🧠 OPUS (architecture/security/billing/compliance)
or ⚡ SONNET (adapters/UI/tests). "Keys" = admin creds needed to *live-verify* (build proceeds gated/mocked without them).

---

### GME-00 — Messaging provider abstraction + registry (foundation) · 🧠 OPUS · keys: none · ✅ DONE (2026-08-08)
**Goal:** Replace the flat `buildSenders` map with a proper **provider registry + router seam** for messaging,
without breaking the existing WhatsApp/Twilio/Telegram/Meta/RCS behaviour.
**Build:**
- Decide + create the seam: `packages/messaging-router/` (sibling to `provider-router`) exposing `SmsProvider`,
  `RcsProvider`, `MessagingRegistry`, capability + country types (or extend `provider-router` with a `messaging`
  capability — document the choice in `BUILD-LOG.md`).
- Define `SmsProvider` interface (`send`, `normalizeDlr`, `parseInbound`, `verify`, `capabilities`, `countries`).
- Port the existing Twilio + WhatsApp + Telegram + Meta + RCS senders to the registry (behaviour-preserving);
  keep `MessageChannel` enum. Add a `provider` field concept (many providers per `SMS` channel).
- Prisma: add `MessageProvider` + `providerId` on `Message` (which concrete provider sent it) — additive migration.
**DoD:** all existing messaging tests green; registry returns the same adapters; new provider = 1 file + 1 registry line.
**Tests:** registry resolution unit tests; existing `senders.test.ts` still passes (adapted).

### GME-01 — BYOK per-tenant key vault for messaging providers · 🧠 OPUS · keys: KMS optional (local `VAULT_MASTER_KEY` works) · ✅ DONE (2026-08-08)
**Goal:** Per-tenant provider credentials, envelope-encrypted, with managed fallback.
**Build:**
- Reuse `ProviderCredential` + `apps/api/src/crypto/envelope.ts`; add messaging provider kinds.
- `MessagingKeyVault.resolve(tenantId, providerId) → {creds, mode: 'byok'|'managed'}` (BYOK first, else platform env).
- CRUD service + routes to set/rotate/delete a tenant's provider creds (write-only; never echo secrets; masked reads).
- Record `mode` on each send (BYOK = thin platform fee; managed = marked-up) — feeds GME-04 billing.
**DoD:** a tenant can store MSG91/Twilio creds; resolver prefers BYOK; secrets never in logs/responses; RLS-scoped.
**Tests:** resolve BYOK vs managed; encryption round-trip; tenant isolation (tenant A can't read B's creds).

### GME-02 — Async send pipeline (BullMQ) + idempotency + retries · 🧠 OPUS · keys: none (Redis)
> **Split into 02a + 02b for reviewable PRs.** **GME-02a ✅ DONE (2026-08-08)** — BYOK-aware send:
> wired `MessagingKeyVault.resolve()` into `MessagingService.send()` via a `createMessagingProvider`
> factory (`defaultProviderForChannel` → resolve BYOK→platform→env → factory → adapter.send), so a
> tenant's stored keys drive the send; used provider persisted on the Message. **GME-02b** = the async
> BullMQ worker + retries/backoff + webhook-replay idempotency + rate limiting (below).
**Goal:** Move sends off the request path; add retries, backoff, rate limiting, webhook-replay idempotency.
**Build:**
- `apps/workers/src/message-sender.ts` BullMQ worker: dequeue → route (GME-03 stub ok) → resolve key → adapter.send
  → persist status → retry/backoff on transient errors → after N, mark FAILED / fall to next provider (GME-03).
- `MessagingService.send()` enqueues (returns `QUEUED`) instead of inline HTTP; keep a `sendSync` for tests.
- Idempotency: unique `(tenantId, providerMessageId)` + a webhook-event dedupe table so DLR replays don't double-update.
- Per-tenant + per-provider rate limiter (token bucket in Redis).
**DoD:** sends enqueue + process async; duplicate DLR webhook is a no-op; transient failure retries then fails cleanly.
**Tests:** enqueue→process; idempotent DLR; retry/backoff; rate-limit rejection.

### GME-03 — Smart router (least-cost, per-country, health, failover) · 🧠 OPUS · keys: none
**Goal:** Pick the best provider per message and fall over on failure.
**Build:**
- `RoutingRule` model (tenant, channel, country/prefix, orderedProviderIds, strategy=`least_cost|priority|failover`).
- `SmartRouter.pick(ctx) → orderedProviders[]`: country/prefix match → strategy → **health filter** (eject providers
  with poor recent delivery/error rate, reuse Day-38 pool health idea) → sticky sender-ID.
- Fallback chain in the worker: try provider[0], on hard-fail try provider[1], … record which succeeded.
- Cost inputs from a per-provider price table (`packages/messaging-router/pricing.ts`).
**DoD:** India numbers route to an India provider by default; a failing provider is skipped; least-cost picks cheapest healthy.
**Tests:** routing by country; failover on error; health ejection; least-cost selection (pure).

### GME-04 — Unified cost metering → UsageRecord + reseller markup · 🧠 OPUS · keys: none
**Goal:** Every message hits the billing pipeline (wallet debit, plan quota, reseller margin) — golden rule #4.
**Build:**
- On send success, emit `UsageRecord(kind='sms'|'rcs'|'whatsapp', tenantId, units=segments|1, costUsd, byok)`
  via the existing cost service; managed keys → marked-up price, BYOK → thin fee.
- Wallet debit + plan-quota decrement + reseller-margin computation (reuse `cost`/`wallet`/`reseller` services).
- Keep `Message.costUsd` for per-message display; reconcile with `UsageRecord`.
**DoD:** a managed SMS debits the wallet with markup; a BYOK SMS charges only the platform fee; reseller sees margin.
**Tests:** managed vs BYOK metering; reseller margin math; quota decrement; tenant scoping.

### GME-05 — India SMS providers wave 1: MSG91 + Gupshup · ⚡ SONNET · keys: `MSG91_AUTHKEY`, `GUPSHUP_API_KEY`
**Build:** two `SmsProvider` adapters (send + DLR normalize + inbound + signature verify), DLT-field aware (GME-06),
sender-ID handling, registry + pricing entries, gated (`QUEUED` until keys). Read each provider's official docs first.
**DoD:** both adapters send (mocked in CI, live-gated), DLR maps to `MessageStatus`, inbound STOP/START works.
**Tests:** send payload shape; DLR mapping; signature verify; opt-out classify.

### GME-06 — India DLT compliance engine · 🧠 OPUS · keys: DLT entity/template IDs (per tenant)
**Goal:** Make Indian SMS lawful: DLT principal-entity + header (sender-ID) + template registration + per-message binding.
**Build:**
- `DltRegistration` model (tenant, entityId, headers[], templates[{dltTemplateId, body, category}]).
- Pre-send validator: India-bound SMS must carry a registered header + DLT template id whose body matches (variable-safe);
  block/return actionable error otherwise. Consent-scrub against `Suppression`/DNC.
- Wire DLT ids into MSG91/Gupshup/Kaleyra/Route-Mobile adapters.
- Config UI stub for DLT registration (fuller UI in GME-18).
**DoD:** a non-DLT India SMS is blocked with a clear reason; a registered template sends with the DLT id stamped.
**Tests:** DLT validation (missing header/template/mismatch); template-body match; India vs non-India routing.

### GME-07 — Global SMS wave 1: Vonage + Plivo + Telnyx · ⚡ SONNET · keys: `VONAGE_*`; Plivo/Telnyx reuse carrier creds
**Build:** three adapters (send + DLR + inbound + verify); **Plivo/Telnyx reuse existing telephony credentials**;
registry + pricing; gated. **DoD/Tests:** as GME-05 per provider.

### GME-08 — Global SMS wave 2: Sinch + MessageBird/Bird + Infobip · ⚡ SONNET · keys: `SINCH_*`, `MESSAGEBIRD_*`, `INFOBIP_*`
**Build:** three adapters (send + DLR + inbound + verify); note Sinch/MessageBird/Infobip also do RCS (flagged for GME-12).
**DoD/Tests:** as GME-05.

### GME-09 — Global SMS wave 3: AWS SNS + Bandwidth + ClickSend · ⚡ SONNET · keys: `AWS_*`, `BANDWIDTH_*`, `CLICKSEND_*`
**Build:** three adapters; AWS SNS via signed API; Bandwidth/ClickSend REST. **DoD/Tests:** as GME-05.

### GME-10 — India SMS wave 2: Kaleyra + Fast2SMS + Route Mobile/ValueFirst + Textlocal · ⚡ SONNET · keys: per provider
**Build:** four adapters, DLT-aware (GME-06). **DoD/Tests:** as GME-05.

### GME-11 — Rich RCS engine core + SMS fallback cascade · 🧠 OPUS · keys: none
**Goal:** First-class rich content + capability negotiation + graceful SMS fallback.
**Build:**
- Extend shared types: RCS `RichMessage` = text | card | carousel | suggestions[] | media; validation.
- `RcsProvider` interface (`sendRich`, `capabilityCheck`, `typingIndicator`, `readReceipt`, `smsFallback`).
- Cascade engine: try RCS (if msisdn RCS-capable) → fallback to WhatsApp/SMS per channel policy; record actual channel used.
- DB: rich payload stored as JSON on `Message` (`richPayload`), plus `fallbackFrom`/`fallbackTo`.
**DoD:** a rich card to a non-RCS number falls back to SMS with the text variant; capability check cached.
**Tests:** rich validation; cascade fallback; capability cache; cost differs by resolved channel.

### GME-12 — RCS providers: Google RBM + Sinch/Twilio RCS · 🧠 OPUS · keys: `GOOGLE_RBM_*`, `SINCH_*`/Twilio
**Build:** Google RBM adapter (agent + service account; rich cards/carousels/suggested replies+actions/media,
typing, read receipts, agent verification/branding) + one CPaaS RCS adapter (Sinch or Twilio). Rich DLR
(typing/read) → status. Gated. **DoD:** a rich carousel sends via RBM (live-gated), read receipts update status.
**Tests:** rich payload build per provider; DLR incl. read; branding/agent id; fallback wiring.

### GME-13 — Rich-message + template studio UI · ⚡ SONNET · keys: none
**Build (`apps/web`):** a rich-message builder (card/carousel/suggestion editor with live preview), per-channel
template management, WhatsApp + DLT template-approval status sync surfaced, variable pickers. Fully localized
(`useI18n().t()` English-as-key + Hindi; run the i18n hand-off tooling for regional). **DoD:** build+preview+save a
rich RCS template; send it from the UI. **Tests:** component + a11y; e2e send (mocked).

### GME-14 — Consent model + in-call consent capture · 🧠 OPUS · keys: none
**Goal:** Capture "can I text you the details?" during the call and store lawful basis.
**Build:**
- Prisma: `Contact.smsConsent/whatsappConsent/rcsConsent` + `messagingConsentBasis` + `messagingConsentAt`
  (additive migration); write `ConsentRecord(channel, granted, basis, region)` too.
- Voice/agent: a **consent node/hook** the agent can trigger (or post-call intent extraction from transcript) that
  records channel consent; expose in the agent builder as a "capture messaging consent" option.
- API to set/revoke consent (audited).
**DoD:** an inbound call that captures a yes sets `Contact.smsConsent=true` + a `ConsentRecord`; revoke works.
**Tests:** consent write/revoke; basis + region stored; tenant scoping; transcript-intent extraction (mocked LLM).

### GME-15 — Unified send-gate (consent · opt-out · DNC · quiet-hours · rate · DLT) · 🧠 OPUS · keys: none
**Goal:** One guarded path every message must pass (no bypass — mirror the OutboundService rule for calls).
**Build:** a `MessagingGuard.check(tenantId, channel, phone, context)` composing: channel **consent** (GME-14) →
`MessagingOptOut` → `Suppression`/DNC (currently call-only) → **quiet-hours** (per-tenant/region) → rate/velocity caps
→ DLT (GME-06, India). `MessagingService.send()` + the worker + automation/workflow executors ALL go through it.
**DoD:** a send without consent is refused with reason; DNC/quiet-hours/rate all enforced; no path skips the guard.
**Tests:** each gate (consent/opt-out/DNC/quiet-hours/rate/DLT) independently; guard is the single choke point.

### GME-16 — Call-end → automation/workflow dispatch + workflow `send_message` action · 🧠 OPUS · keys: none
**Goal:** Actually fire the follow-up when a call ends, from both automation + visual workflow builders.
**Build:**
- `recordDisposition` (+ transcript-ingest end hook) → `automations.dispatch(call_ended,{callId,contactId,to,disposition,agentId})`
  **and** `workflows.dispatchEvent(call_ended, …)` (fire-and-forget, tenant-scoped).
- Add `send_message` to `WORKFLOW_ACTION_TYPES` (shared) + the worker `workflow-execution` executor (channel or
  **cascade** + template) → routes through `MessagingGuard`/queue. Extend `send_message` automation action to RCS + cascade.
- Builder UI: `send_message` node config in the workflow builder (channel/cascade + template picker) — localized.
**DoD:** end an inbound call → matching automation/workflow → gated SMS/RCS follow-up sent; visible in message log.
**Tests:** dispatch on call end; workflow send_message executes; cascade RCS→WhatsApp→SMS; consent gate honoured.

### GME-17 — Message campaigns + blended call+message journeys · ⚡ SONNET · keys: none
**Build:** SMS/RCS **campaigns** (reuse campaign scheduler seam; enqueue to the message worker, tenant/pace/quiet-hours
capped, all via `MessagingGuard`); blended journeys (call → if disposition X → message). **DoD:** a message campaign
sends to a consented list respecting caps + guard. **Tests:** campaign enqueue; pace/quiet-hours; guard enforced.

### GME-18 — Provider config + routing + DLT UI · ⚡ SONNET · keys: none
**Build (`apps/web`):** per-tenant **BYOK key config** (masked, write-only) for each provider, sender-ID pools,
**DLT registration** UI (entity/headers/templates), **routing-rules** editor (per country/channel/strategy), provider
health status. Localized. **DoD:** a tenant configures MSG91 BYOK + a DLT template + a route rule from the UI.
**Tests:** config CRUD; secrets never rendered; routing-rule validation.

### GME-19 — Deliverability dashboard + analytics · ⚡ SONNET · keys: none
**Build:** per-provider/per-country **delivery rate, cost, latency, fallback %, opt-out rate**, spend vs quota,
reseller margin; drill-down to message log with status timeline. Localized. **DoD:** dashboard shows real metrics
from `Message`/`UsageRecord`. **Tests:** aggregation queries; tenant scoping; empty-state.

### GME-20 — Anti-abuse hardening + compliance + launch · 🧠 OPUS · keys: none
**Build:** spam/velocity/loop guards, per-tenant daily caps, STOP/HELP/START compliance surface + audit, PII-safe
logging review, load test the worker, full A–K self-audit, update `docs/PROJECT-FEATURES-EXPLAINED.md` (+ `.docx`),
launch checklist + `PREREQUISITES.md` entries for every provider key. **DoD:** everything green; feature demoable
end-to-end (call → consent → follow-up) on a dedicated test tenant. **Tests:** abuse guards; compliance audit; e2e.

---

## 4. Admin credential map (per day — set to *live-verify*; build proceeds gated)

| Day | Keys to have ready (else built gated/mocked) |
|-----|----------------------------------------------|
| GME-00..04 | none (Redis + local `VAULT_MASTER_KEY`) |
| GME-05 | `MSG91_AUTHKEY`, `GUPSHUP_API_KEY` (+ DLT ids) |
| GME-06 | per-tenant DLT entity/header/template IDs |
| GME-07 | `VONAGE_API_KEY/SECRET` (Plivo/Telnyx reuse carrier creds) |
| GME-08 | `SINCH_*`, `MESSAGEBIRD_ACCESS_KEY`, `INFOBIP_BASE_URL/API_KEY` |
| GME-09 | `AWS_ACCESS_KEY_ID/SECRET` (+ region), `BANDWIDTH_*`, `CLICKSEND_*` |
| GME-10 | `KALEYRA_*`, `FAST2SMS_API_KEY`, `ROUTEMOBILE_*`/`VALUEFIRST_*`, `TEXTLOCAL_API_KEY` |
| GME-11 | none |
| GME-12 | `GOOGLE_RBM_*` (agent + service account), `SINCH_*` or Twilio RCS |
| GME-13..20 | none (UI/logic; providers already gated) |

> All keys are **BYOK-capable** (per-tenant vault, GME-01) with a platform-managed env fallback. Add each to
> `PREREQUISITES.md` and `.env.example` as we build (never commit real values).

---

## 5. Risks / decisions to watch
- **DLT (India)** is the hardest compliance surface — get GME-06 right before pushing India volume.
- **RCS availability** varies by carrier/handset — the SMS-fallback cascade (GME-11) is mandatory, not optional.
- **Provider DLR formats differ wildly** — normalize behind `normalizeDlr` per adapter; test each.
- **Idempotency** on webhook replays (GME-02) — providers retry DLRs; dedupe or we double-bill/double-update.
- **BYOK secret hygiene** — encrypted at rest, masked in reads, never logged (self-audit every day).
- **Don't bypass `MessagingGuard`** (GME-15) — every send path (API, worker, automation, workflow, campaign) routes through it.

---

## 6. Execution
We go **one GME day at a time**, each shipped as its own PR via the `/tmp` workflow (CI-green → squash-merge →
reconcile), with `BUILD-LOG.md` + this file updated and the A–K self-audit written out. Regional UI strings use the
`scripts/i18n` hand-off kit. **Progress: GME-00 ✅ (#249) · GME-01 ✅ (#250) · GME-02a ✅. Next: `GME-02b` (async BullMQ send pipeline + retries + idempotency + rate-limit).**
