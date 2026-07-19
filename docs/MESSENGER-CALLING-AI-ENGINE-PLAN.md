# Messenger (Meta) Calling → VocalIQ AI Voice Engine — Complete Integration Plan

> **What this is.** A deep, implementation-grade plan to add the **Messenger Platform Calling API** (Meta's WebRTC voice calling between a Facebook **Page** and Messenger users) as a first-class **calling channel + AI voice-agent transport** inside VocalIQ — so a tenant's AI voice agent can answer (and, later, place) **Messenger voice calls** exactly like it answers WhatsApp / PSTN / SIP / web calls today.
> **Relationship to WhatsApp Calling.** This is a near-sibling of the shipped **WhatsApp Calling module** (`docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md`, WAC-00…11). The two Meta calling APIs are architecturally parallel (Graph API signaling + WebRTC/OPUS media + HMAC webhooks), so we **reuse the proven WAC architecture** and only replace the channel-specific pieces. This plan calls out exactly what is reused vs. what is new — and, per **CLAUDE.md §15**, what must be **confirmed against Meta's official docs before we build the media path** (nothing here is guessed as fact).
> **Status:** planning / design. Foundation (MEC-01) in progress. Live paths gated until Meta creds + a confirmed wire format exist (same discipline as WAC).

---

## 0. TL;DR (the one-screen version)

- **Messenger Calling = WebRTC voice calls between a Facebook Page and a Messenger user**, over the **same Page + Graph API + Meta webhooks** that VocalIQ's `messaging` module **already** integrates for Messenger text (Day 93: `MetaMessagingSender`, `verifyMetaSignature`, `MESSENGER_PAGE_ACCESS_TOKEN`). Meta has taken this API **GA**: any app with the **`pages_messaging`** permission can enable **inbound + outbound** voice calling; it ships a **Call settings webhook**, a **Call permissions API**, a **Call metrics API**, and an **audio call-button CTA**.
- **The identity model is the one big difference from WhatsApp.** Messenger has **no phone numbers**: a user is a **PSID** (Page-Scoped ID) and the business is a **Page ID**. Consequences that make this *not* a blind clone of WAC:
  - Entry points are **`m.me` links + the audio call button on the Page**, not `wa.me/call/<number>`.
  - There is **no per-country dial-code rate routing** and **no PSTN least-cost-routing fallback** (a Messenger user has no phone number to fall back to) → **WAC-09 (LCR) does not apply**.
  - There is **no SIP mode** (SIP was for WhatsApp phone-number/PBX tenants) → **WAC-10 does not apply**.
- **Strategic fit is unusually strong** — the *same four seams* WhatsApp Calling slotted into are already built and channel-agnostic:
  1. **Meta webhook + HMAC infra** — `verifyMetaSignature()`, per-tenant `/public/messaging/messenger/:tenantId` route, `MESSENGER_APP_SECRET` / `MESSENGER_VERIFY_TOKEN` (Day 93) — **reused as-is**.
  2. **WebRTC-native voice service** running the AI loop (STT→LLM→TTS) — `ConversationLoop` is **transport-neutral** (consumes `AsyncIterator[bytes]`, writes to an `AudioSink`); WhatsApp and LiveKit already prove two transports plug in — **reused as-is**.
  3. **Provider-router telephony seam** — the WhatsApp adapter is the only place Graph-API calling specifics live; we add a **parallel `MessengerCallingTelephony` adapter** next to it.
  4. **Cost / wallet metering** — `UsageRecord(provider, TELEPHONY, costUsd)` + idempotent `billedAt` claim — **reused**, with a Messenger rate table (free-tier default, see §I).
- **Recommended path: Graph-API + WebRTC** (mirrors WAC): signaling in `apps/api` (webhook → accept/terminate lifecycle), media in a new **WebRTC bridge in the voice service** that terminates Messenger's peer connection and feeds the existing Pipecat/LiveKit AI pipeline.
- **Inbound-first** (same call as WhatsApp): a Messenger user taps the **audio call button** on the Page → the AI agent answers instantly with context. **Outbound (Page→user) is phase 2**, gated behind the **Call permissions API** + a confirmed rate model.

---

## PART A — The Messenger Platform Calling API (technical reference + what must be confirmed)

> **⚠️ Confidence note (CLAUDE.md §15).** The *high-level* shape below is corroborated across Meta's developer site and multiple provider write-ups (WebRTC, inbound+outbound, `pages_messaging`, call-settings webhook, call-permissions API, call-metrics API, audio call-button CTA). The *low-level wire format* (exact endpoint paths, the `calls`/`call` webhook field structure, SDP offer/answer exchange fields, error codes, pricing) is **not fully public** and returned server errors on direct fetch during research. Every such detail is marked **[CONFIRM @ MEC-00]** and is isolated behind the provider-router adapter so that confirming it changes *one file*, not the module.

### A.1 What it is
A Facebook **Page** (connected to a Meta app with `pages_messaging`) can **receive** WebRTC voice calls from Messenger users and — with permission — **place** calls to them. One Page does message **and** call on a single brand identity. Signaling rides Meta's Graph API + Messenger webhooks; media is **WebRTC (ICE + DTLS + SRTP, OPUS)** — the same media stack as WhatsApp Calling.

### A.2 Identity & addressing (the WhatsApp contrast)
| Concept | WhatsApp Calling | **Messenger Calling** |
|---|---|---|
| Business identity | WABA **phone number** (`PHONE_NUMBER_ID`) | **Page** (`PAGE_ID`, addressed as `me` with the Page token) |
| User identity | E.164 phone / BSUID | **PSID** (Page-Scoped ID), from the messaging webhook |
| Entry point | `wa.me/call/<number>` deep link, call button | **`m.me/<page>`**, **audio call button CTA** on the Page **[CONFIRM @ MEC-00]** |
| Auth | Bearer WABA token | **Page access token** (`MESSENGER_PAGE_ACCESS_TOKEN`, already set in Day 93) |
| Webhook | `whatsapp_business_account` → `calls` | Messenger `object: page` → call event field **[CONFIRM @ MEC-00 — likely `calls`/`call`]** |

### A.3 Inbound — user-initiated calls (the primary flow)
Expected lifecycle (mirrors WhatsApp, **[CONFIRM @ MEC-00]**): **call webhook (caller SDP offer) → business accepts with SDP answer (Graph API) → WebRTC media → terminate/metrics event.**
- The **call permissions API** lets us check whether the Page may place/receive under current limits before acting.
- The **call settings webhook** notifies us when a Page's Messenger call settings change (availability, call-button visibility) so we can mirror state locally.
- Context: any `ref` / postback payload carried by the `m.me` entry point or the call button is the Messenger analog of WhatsApp's `cta_payload` — **this is how the agent greets with context** (which ad/button/intent). **[CONFIRM @ MEC-00: exact field name.]**

### A.4 Outbound — Page-initiated calls (phase 2, gated)
Expected lifecycle (mirrors WhatsApp): **check call permission → initiate call with Page SDP offer → user SDP answer → ringing/accepted/rejected → terminate.** Governed by the **Call permissions API** and Messaging-window / rate rules that **differ** from WhatsApp's (no 5-country block, no `wa.me`; the exact caps are **[CONFIRM @ MEC-00]**). We do **not** dial until permission + caps are confirmed.

### A.5 Media & tech
- **WebRTC**: ICE + DTLS + SRTP, **OPUS** (same as WhatsApp) — so the voice-service WebRTC bridge is a **near-copy** of `whatsapp_webrtc.py`, differing only in SDP/candidate quirks **[CONFIRM @ MEC-00]**.
- **DTMF**: assume none / RFC 4733-over-RTP if present **[CONFIRM @ MEC-00]** — the loop already tolerates "no DTMF".

### A.6 Pricing
- Messenger **messaging** is free-tier in our model (`messageCostUsd('MESSENGER') === 0`). Messenger **calling** pricing is **not publicly documented**; we default the rate table to **$0 (free-tier)** and still **meter every call** (duration + `UsageRecord`, golden rule #4) so switching on a real rate later is a one-line table change. **[CONFIRM @ MEC-00.]**

---

## PART B — Why this is a strong fit for VocalIQ (reuse map)

| VocalIQ capability (already built) | Reused for Messenger Calling? | Notes |
|---|---|---|
| `verifyMetaSignature()` (HMAC-SHA256 over raw body) | ✅ as-is | Day 93 Messenger webhook already uses it. |
| Per-tenant Meta webhook route `/public/messaging/messenger/:tenantId` | ✅ extend | Add call-event dispatch beside the existing message dispatch. |
| `MESSENGER_PAGE_ACCESS_TOKEN` / `MESSENGER_APP_SECRET` / `MESSENGER_VERIFY_TOKEN` | ✅ as-is | Same Page + app → same creds do messaging **and** calling. |
| `ConversationLoop` (STT→LLM→TTS), provider contracts | ✅ as-is | Transport-neutral; inject same LoopConfig. |
| WebRTC audio adapters (`WhatsAppCallerAudio`/`WhatsAppAudioSink`) | ♻️ generalize | Extract a channel-neutral `webrtc_audio.py`; both channels use it. |
| `WaMediaControl` api↔voice HTTP contract (`X-Internal-Secret`) | ♻️ mirror | New `MessengerMediaControl` + `/calls/messenger/*` voice endpoints. |
| Unified `Call` model + recording/transcript/analytics | ✅ extend | Add `MESSENGER` to `CallChannel`; link `MessengerCall.callId`. |
| Cost metering `UsageRecord` + idempotent `billedAt` | ✅ mirror | New `Provider.MESSENGER`; Messenger rate table (free default). |
| Inbound agent routing (PUBLISHED agent, persona, flow) | ✅ reuse logic | Resolve by Page assignment, else first PUBLISHED agent. |
| Web dashboard component library + TanStack patterns | ✅ reuse | New `/dashboard/messenger-calling` pages. |

**What is NOT reused (Messenger-specific or dropped):** `wa.me` deep links, per-country dial-code rate routing, **WAC-09 least-cost PSTN routing** (no phone number to fall back to), **WAC-10 SIP mode**, the 5-country outbound block, WhatsApp permission caps (Messenger has its own **[CONFIRM]**).

---

## PART C — Integration architecture (design)

### C.1 Recommended: Graph-API + WebRTC (mirrors WAC-03)
```
Messenger user  ──(taps audio call button / m.me)──►  Meta (Messenger Platform)
        │  call webhook (HMAC)  ▼
   apps/api  messenger-calling/  (signaling, lifecycle, routing, cost)   ── verifyMetaSignature()
        │  POST /calls/messenger/answer  { call_id, sdp_offer, tenant, agent, prompt, greeting }  (X-Internal-Secret)
        ▼
   apps/voice  messenger_webrtc.py  (aiortc peer: OPUS 48k ⇄ 16k)  ──►  ConversationLoop (STT→LLM→TTS)
        ▲  SDP answer
   apps/api  MessengerCallingTelephony (provider-router)  ──(Graph API accept/terminate)──►  Meta
```

### C.2 Components to build (parallel to WAC)
- **provider-router:** `adapters/messenger-calling.ts` — `MessengerCallingTelephony` (Graph API signaling: answer/accept/terminate, call-permissions read, settings). Only place Messenger calling specifics live (golden rule #2).
- **shared:** `messenger-call-link.ts` (m.me entry point + context payload — our own convention), `messenger-video.ts` (media-mode gate, audio-GA), later `messenger-permission.ts` (outbound governor).
- **db:** `MessengerCall`, `MessengerCallEvent`, `MessengerCallVolume`, `MessengerCallPermission` (+ `MessengerPermissionRequest` in phase 2). Every table `tenantId` + RLS `tenant_isolation` policy. `Provider += MESSENGER`, `CallChannel += MESSENGER`.
- **api:** `messenger-calling/` module — `messenger-calling.service.ts` (lifecycle), `.webhooks.ts` (dispatch), `.routes.ts` (dashboard read/write), `messenger-media-control.ts`, `messenger-call-cost.service.ts`, `messenger-call-read.service.ts`, `messenger-call-settings.service.ts`, `messenger-call-routing.service.ts` (inbound agent resolve).
- **voice:** `telephony/messenger_webrtc.py` + `calls/messenger_router.py` (+ generalized `webrtc_audio.py`).
- **web:** `/dashboard/messenger-calling` (overview, live view, call-button/entry-point generator) + `/dashboard/settings/messenger-calling`.

### C.3 Cross-cutting (golden rules — non-negotiable)
- **Tenant isolation:** every new table `tenantId` + RLS; every route `auth + tenant` middleware; webhook keyed by `:tenantId` path + HMAC.
- **Cost on every call:** meter on terminate → `UsageRecord(Provider.MESSENGER, TELEPHONY)`, idempotent `billedAt`. Free-tier still records a $0 usage row (never an unmetered path).
- **Security:** never log the Page token or SDP; HMAC-verify every webhook; Zod-validate every input; `X-Internal-Secret` gated on the api↔voice hop (503 when unset).
- **Never break WhatsApp Calling:** Messenger Calling is a **parallel module** — no edits to shipped WAC files beyond the shared enum additions. (Consolidating WAC+MEC into one calling core is noted as future tech-debt, not done now — golden rule #6.)

---

## PART D — The innovative AI engine (differentiators)
1. **Context-aware answering** — the agent opens already knowing which button/ad/`m.me` `ref` the user tapped (Messenger analog of WAC's context brief).
2. **Chat ↔ call handoff** — same Messenger thread + same VocalIQ contact: escalate a text chat to an AI voice call and back, with shared memory (Day 34 agent memory, contact-scoped).
3. **One agent, every Meta surface** — the *same* published AI agent answers WhatsApp calls, Messenger calls, and PSTN, with per-channel persona overrides.
4. **Cross-channel contact memory** — unify a person across Messenger chat + call + WhatsApp + PSTN on the VocalIQ `Contact`.
5. **Free inbound AI reception** — inbound Messenger calls are free-tier; an always-on AI receptionist on a brand's Facebook Page at ~zero telephony cost.
6. **Consented outbound (phase 2)** — permission-and-callback automation via the Call permissions API, mirroring WAC-08's governor but with Messenger's rules.

---

## PART E — Prerequisites (admin / Meta)
Most are **already set** from Day 93 (Messenger messaging):
- ✅ `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN` — same Page/app.
- 🔲 App must have **`pages_messaging`** granted/advanced-access **and Messenger Calling enabled** for the Page (App Review / allow-list as Meta requires). **[CONFIRM @ MEC-00.]**
- 🔲 Subscribe the Page webhook to the **call event field(s)** and **`call_settings`** field. **[CONFIRM @ MEC-00: exact field names.]**
- 🔲 (optional) `MESSENGER_GRAPH_VERSION` override (default `v21.0`).

> No *new* secret is expected for a first inbound spike — the Day-93 Messenger creds should cover it. If Meta requires a separate calling token/allow-list, that surfaces at MEC-00 and we emit the `🔑 ADMIN ACTION REQUIRED` block then.
>
> 📋 **Admin go-live checklist:** `docs/runbooks/messenger-calling-setup.md` — step-by-step Meta access (Page + `pages_messaging` Advanced Access + Calling API allow-list + webhook subscription) and the MEC-00 confirmation checklist mapping each `[CONFIRM]` to its one code location.

---

## PART F — Cost model & attribution
- Inbound Messenger call: **$0** carrier cost in our default table (still metered as a $0 `UsageRecord`), + real AI-loop cost (STT/LLM/TTS) metered by the voice loop exactly as today.
- Outbound (phase 2): rate table keyed like WhatsApp's but **Messenger has no country dial codes** → a **flat per-minute** band (default `0`), pulse-rounded, monthly-volume-aware if Meta tiers it. **[CONFIRM @ MEC-00.]**
- Idempotent metering via atomic `billedAt` claim (copy of WAC-06).

---

## PART G — Phased build plan (MEC-00 … MEC-08)

> Cadence mirrors WAC: **one PR per phase**, each green (typecheck + lint + test + build), each with A–K self-audit, each gated so nothing live fires without creds + a confirmed wire format.

| Phase | Title | Scope | Reuses / New |
|---|---|---|---|
| **MEC-00** | **Spike & confirm** | Confirm the REAL wire format against Meta docs + a Page sandbox: webhook field name & shape, accept/terminate endpoints, SDP exchange, entry-point/`ref` field, permission model, pricing. Output: a findings doc that un-`[CONFIRM]`s Part A. **Gate for the media path.** | research + tiny spike |
| **MEC-01** | **Foundation (this PR)** | `MessengerCallingTelephony` adapter (gated, HTTP-injected, assumptions marked) · Messenger rate/pricing fns (free default) · `messenger-call-link.ts` (m.me + context payload) · `messenger-video.ts` (media-mode) · `Provider/CallChannel += MESSENGER` (shared+prisma sync) · exports · tests. **No live path.** | new, all offline-testable |
| **MEC-02** | Webhook + signaling service + DB | `MessengerCall*` models + RLS migration · `messenger-calling.webhooks.ts` dispatch on the existing Messenger route · `messenger-calling.service.ts` lifecycle (onConnect/onStatus/onTerminate) · `messenger-media-control.ts` (Pending + Http). | mirror WAC-02 |
| **MEC-03** | Voice WebRTC bridge | `webrtc_audio.py` (generalized) · `messenger_webrtc.py` · `calls/messenger_router.py` (`/calls/messenger/*`, `X-Internal-Secret`) · pure unit tests. | mirror WAC-03 |
| **MEC-04** | Inbound AI answering GA + live view | inbound routing → PUBLISHED agent + unified `Call` · context brief from `ref` · web live-call view. | mirror WAC-04 |
| **MEC-05** | Call settings | availability / call-button visibility, synced to Meta via the adapter; `call_settings` webhook mirror. | mirror WAC-05 |
| **MEC-06** | Cost metering | `messenger-call-cost.service.ts` — meter on terminate → `UsageRecord`, idempotent `billedAt`, monthly volume. | mirror WAC-06 |
| **MEC-07** | Web panel + entry-point generator | `/dashboard/messenger-calling` overview + m.me / call-button generator + health. | mirror WAC-07 |
| **MEC-08** ✅ | Consented outbound (permissions) — **DONE (gated)** | `messenger-permission.ts` pure governor + `MessengerPermissionService` (reads the **live** Call-Permissions API — caps come from Meta, not hardcoded) + `placeOutboundCall` (gate → Page SDP offer → adapter `placeCall`) + `POST /messenger-calling/calls` + `GET /permissions` inspector + web outbound card. Unanswered back-off **derived from `MessengerCall` history** (no new table). Fully gated: 503/blocked until Meta creds + a live grant. Live dialing still needs MEC-00 to confirm the wire format. | mirror WAC-08 |
| ~~MEC-09~~ | ~~Least-cost routing~~ | **N/A** — no PSTN fallback for a PSID. | dropped |
| ~~MEC-10~~ | ~~SIP mode~~ | **N/A** — no phone number / PBX. | dropped |
| **MEC-11** | (opt) Video / screen-share | when Meta GA's Messenger video, flip the media-mode gate. | mirror WAC-11 |

---

## PART H — Risks & mitigations
- **Undocumented wire format (top risk).** → All Meta specifics isolated in the adapter + a MEC-00 spike is the gate before the media path; everything marked `[CONFIRM]` until proven against a real Page.
- **API access / allow-list.** Messenger Calling may need App Review or an allow-list per Page. → MEC-00 surfaces it; module stays gated (503/QUEUED) until enabled — the Day-93 gating pattern.
- **Breaking WhatsApp Calling.** → Parallel module; only additive shared-enum edits touch shipped files; full WAC test suite must stay green.
- **PSID ≠ phone.** → No dial-code routing/LCR/SIP; contact unification keyed on PSID + existing `Contact` links.

## PART I — Open decisions for the admin
1. **Scope now:** inbound-first (MEC-01→07), defer outbound (MEC-08) until permissions confirmed? (**recommended: yes**, matches WhatsApp Calling's inbound-first rollout.)
2. **Separate calling token/allow-list?** — confirm at MEC-00 whether the Day-93 Messenger creds suffice or Meta wants a distinct calling enablement.
3. **Pricing:** keep Messenger calling at $0 (free-tier) in the rate table until Meta publishes a rate? (**recommended: yes**, still metered.)

---

## Sources (high-level; low-level to be confirmed at MEC-00)
- Meta for Developers — Messenger Platform (`developers.facebook.com/documentation/business-messaging/messenger-platform`)
- Meta for Developers — Messenger Platform Webhooks / Changelog
- Meta for Developers — WhatsApp Cloud API Calling (`/docs/whatsapp/cloud-api/calling/`) — the sibling API this mirrors
- VocalIQ internal: `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` (WAC-00…11) + the shipped `whatsapp-calling` module.
