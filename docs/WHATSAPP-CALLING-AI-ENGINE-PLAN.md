# WhatsApp (Meta) Business Calling → VocalIQ AI Voice Engine — Complete Integration Plan

> **What this is.** A deep, implementation-grade plan to add **WhatsApp Business Calling API** (Meta's official VoIP-over-WhatsApp) as a first-class **calling channel + AI voice-agent transport** inside VocalIQ — so a tenant's AI voice agent can answer and place **WhatsApp voice calls** exactly like it does PSTN/SIP/web calls today.
> **Researched from** Meta's official docs (`developers.facebook.com/documentation/business-messaging/whatsapp/calling` and all its sub-pages) on 2026-07-16, then mapped onto VocalIQ's actual codebase. API behaviour here is quoted from the docs, not guessed (CLAUDE.md §15).
> **Status:** planning / design. Nothing built yet. This doc is the spec + phased build plan + the admin decisions needed.

---

## 0. TL;DR (the one-screen version)

- **WhatsApp Calling = VoIP calls between a WhatsApp user and a WhatsApp Business number**, over the **same WABA + phone number + Graph API + webhooks** that VocalIQ's `messaging` module **already** integrates for WhatsApp text. Media is **WebRTC (ICE + DTLS + SRTP, OPUS 48 kHz)** by default, or **SIP-over-TLS** as an alternative signaling mode.
- **Strategic fit is unusually strong:** VocalIQ already has (a) WhatsApp Cloud API + Meta HMAC webhook infra (`WhatsAppSender`, `verifyMetaSignature`), (b) a **WebRTC/LiveKit-native voice service** running the AI loop (STT→LLM→TTS), (c) a **provider-router telephony seam** (Twilio/Telnyx/Plivo adapters), and (d) **cost/wallet metering**. WhatsApp Calling slots into all four.
- **Recommended path: Graph-API + WebRTC** (not SIP): signaling handled in `apps/api` (webhook → `pre_accept`/`accept`/`connect`/`terminate`), media handled by a new **WebRTC bridge in the voice service** that terminates WhatsApp's peer connection and feeds the existing Pipecat/LiveKit AI pipeline. Keeps the full webhook lifecycle (needed for **cost attribution + analytics**), no Asterisk to operate.
- **Inbound (user→business) is the sweet spot:** globally available, **free**, no permission friction → an AI agent that instantly answers WhatsApp calls. **Outbound (business→user) is powerful but constrained:** requires per-user **permission**, tight rate limits (≈100 connected calls/user/day, 1–2 permission requests/week), **blocked from US/CA/EG/VN/NG business numbers**, and is **billed per-minute**.
- **The innovative engine** = fuse WhatsApp's *chat + call + context payloads + deflection + voicemail* with VocalIQ's AI agent: **context-aware answering** (the agent knows which button/deep-link/ad the caller tapped), **chat↔call handoff**, **permission-and-callback automation**, **AI voicemail**, and **cross-channel memory** (same contact across WhatsApp chat + call + PSTN).

---

## PART A — The WhatsApp Business Calling API (deep technical reference)

### A.1 What it is
A business with a **Cloud-API-connected WhatsApp Business number** can **receive** calls from WhatsApp users and (with permission) **place** calls to them — voice today, video/screen-share "in development". One number does message **and** call, worldwide, on a single verified brand identity. All signaling rides Meta's Graph API + webhooks (or SIP); all media is WebRTC/SRTP.

### A.2 Two signaling/media modes (pick one per phone number)

| Mode | Signaling | Media | Notes |
|---|---|---|---|
| **Default (Graph API + Webhooks)** | Graph API endpoints + `calls` webhook (HTTPS) | **WebRTC**: ICE + DTLS + SRTP, **OPUS** | Full call-lifecycle webhooks; Meta proxies signaling. **Recommended for VocalIQ.** |
| **SIP + WebRTC** | **SIP over TLS** (must be explicitly enabled) | WebRTC (ICE+DTLS+SRTP), OPUS | You run a SIP server (e.g. Asterisk). |
| **SIP + SDES** | SIP over TLS | **SDES-SRTP** (no ICE/DTLS → faster setup) | You run a SIP server. |
| Additional codecs | — | **G.711 PCMA/PCMU** (8 kHz, ~64 kbps, needs transcoding) + telephone-event/DTMF | For legacy/PSTN-gateway interop only; OPUS is default + preferred. |

> ⚠️ **SIP is exclusive:** *"When SIP is `ENABLED`, this phone number exclusively uses SIP for call signaling and will not work with Graph APIs"*, and **calling webhooks are OFF by default** in SIP mode (must set `sip.webhook_delivery: ENABLED`, and even then payloads carry **no SDP** because the SIP server owns media). mTLS is **not** supported.

### A.3 Inbound — user-initiated calls (C2B) — the primary flow

Lifecycle: **Connect webhook (caller's SDP offer) → business `pre_accept` (SDP answer, establishes WebRTC) → business `accept` → media flows only after `200 OK` → Terminate webhook.**

- **Connect webhook** (`field: "calls"`, `calls[].event: "connect"`, `direction: "USER_INITIATED"`): carries `calls[].id` (WACID `wacid.…`), `to`, `from`, `from_user_id` (BSUID), `session.sdp_type: "offer"`, `session.sdp` (RFC 8866), plus **`cta_payload`** (from a call button) and **`deeplink_payload`** (from a `wa.me/call` link) — *this is how the agent knows the caller's intent/context*.
- **Endpoints** — all `POST /<PHONE_NUMBER_ID>/calls` with `messaging_product:"whatsapp"`, `call_id`, `action`:
  - `pre_accept` + `session{sdp_type:"answer", sdp}` — establish WebRTC early (avoids audio clipping / first-word loss).
  - `accept` + `session{answer}` + optional `biz_opaque_callback_data` (≤512 chars, echoed in Terminate).
  - `reject` / `terminate`.
- **Timing:** ~**30–60 s** to accept after Connect or the user sees "Not Answered". **Flow media only after the `accept` `200 OK`** (too early → caller misses first words; too late → silence). Always call `terminate` even if RTCP BYE was seen (for accurate billing).
- **Terminate webhook:** `status: ["Completed"|"Failed"]`, `start_time`, `end_time`, `duration` (seconds, only if picked up), `errors[]`, echoed `biz_opaque_callback_data`.
- **DTMF:** RFC 4733 over RTP, **8000 Hz** clock only (no 48 kHz for DTMF); **no webhook for DTMF** — must be read from the media/RTP.
- **Eligible caller devices:** primary + companion iPhone/Android only (no web/tablet/glasses; callback not yet on companion).

### A.4 Outbound — business-initiated calls (B2C) — powerful but gated

Lifecycle: **get permission → `POST /<PHONE_NUMBER_ID>/calls` with `action:"connect"` + business SDP *offer* → returns `calls[].id` → Connect webhook returns the user's SDP *answer* (apply to WebRTC) → Status webhooks `RINGING → ACCEPTED|REJECTED` → Terminate.**

- **Initiate body:** `{ messaging_product, to | recipient(BSUID), action:"connect", session:{sdp_type:"offer", sdp}, biz_opaque_callback_data? }`.
- **Status webhook** (`statuses[].type:"call"`): `RINGING`, `ACCEPTED`, `REJECTED`, then Terminate carries `COMPLETED`/`FAILED` + `duration`.
- **Attempt rate limit:** 10,000 call attempts / 24 h per business number.
- **Missing permission →** error **`138006`**.

### A.5 Permissions & limits (the outbound governor)
- **States:** `no_permission` | `temporary` (7 days / 168 h, has `expiration_time`) | `permanent`. **Only the user grants/revokes.**
- **Get it 3 ways:** (1) **permission-request interactive message** (`interactive.type:"call_permission_request"`) or an approved **template**; (2) **callback permission** — set `callback_permission_status:"ENABLED"` so a user who *calls you* auto-grants **temporary** permission; (3) via the business profile.
- **Limits (production, per business↔user pair):** **≤100 connected calls / 24 h**; **≤1 permission request / 24 h**, **≤2 / 7 days** (resets after any connected call). Sending caps + status via `GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=…` → returns `permission{status,expiration_time}` + `actions[]{can_perform_action, limits[]{time_period, max_allowed, current_usage, limit_expiration_time}}`.
- **Auto-revocation:** 2 consecutive unanswered → user nudge; **4 consecutive unanswered → permission auto-revoked**.
- **Permission-reply webhook:** `interactive.type:"call_permission_reply"` → `{response:"accept"|"reject", is_permanent, expiration_timestamp, response_source:"user_action"|"automatic"}`. **No webhook when a temporary permission simply expires** (must track the clock yourself).

### A.6 Call settings — `POST /<PHONE_NUMBER_ID>/settings` (`GET` to read; `?include_sip_credentials=true`)
`calling{ status, call_icon_visibility (DEFAULT|DISABLE_ALL), call_icons{restrict_to_user_countries[]}, call_hours{status, timezone_id(IANA), weekly_operating_hours[{day_of_week, open_time, close_time}] (≤2/day, no overlap), holiday_schedule[{date, start_time, end_time}] (≤20)}, callback_permission_status, sip{…}, audio{additional_codecs:["PCMA","PCMU"]}, voicemail{status, triggers:["REJECT"|"TIMEOUT"], audio{default{announcement_media_id, timeout_seconds 0-30}}}, srtp_key_exchange_protocol("DTLS"|"SDES") }`.
- **Calling hours:** outside hours the user sees "chat with business / request a callback"; disabled = 24×7 open.
- **Voicemail:** on `REJECT`/`TIMEOUT` Cloud API auto-answers, plays your OGG/OPUS (<60 s) announcement, records, and **delivers the voicemail as an inbound audio message via the `messages` webhook** where `messages[].id` = the **call ID (WACID)** (correlates to the call).
- **Settings-update webhook:** subscribe `account_settings_update` (get notified when calling/SIP/permission settings change).

### A.7 Entry points — call buttons & deep links (context carriers)
- **Interactive `voice_call` message:** `interactive.type:"voice_call"`, `action.parameters{display_text(≤20), ttl_minutes(1–43200, default 10080), payload(≤512)}`. The `payload` returns as **`cta_payload`** in the call webhook.
- **`voice_call` template button** (approved template) — same, for business-initiated re-engagement.
- **Deep link:** `wa.me/call/<BUSINESS_PHONE_NUMBER>?biz_payload=<payload>` (not on desktop). The `biz_payload` returns as **`deeplink_payload`**. Perfect for **click-to-call from web / ads / QR / email**.

### A.8 Media & tech specifics
- **WebRTC:** ICE + DTLS-SRTP; **OPUS** (payload 111, 48 kHz/2ch, `useinbandfec=1`, `maxaveragebitrate=20000`, `maxplaybackrate=16000`); G.711 PCMU(0)/PCMA(8) optional; telephone-event 101/126.
- **SDES option** (SIP): plaintext key in SDP over TLS, no STUN/ICE, faster setup. **Meta expects the *business* side to send the first SRTP packet** either way.
- **SIP custom headers** (SIP mode): `x-wa-meta-wacid`, `x-wa-meta-user-id`, `x-wa-meta-parent-user-id`, `x-wa-meta-username`, `x-wa-meta-cta-payload`, `x-wa-meta-deeplink-payload`, and on BYE `x-wa-meta-call-duration`.

### A.9 Pricing (drives cost attribution — golden rule #4)
- **Inbound (user-initiated): FREE.**
- **Outbound (business-initiated):** billed **per-minute in 6-second pulses, rounded up** (a 56 s call = 10 pulses); **only when answered** (initiating/ringing/unanswered = free). Volume-tiered by **destination country code** and **monthly minutes** (same tier accrual as messaging; e.g. 0–50k, 50,001–250k min bands, tier boundary uses the lower rate; resets monthly). **16 currencies.** **No free tier; a valid payment method is required.**

### A.10 Sandbox & prerequisites
- **Sandbox = Tech Partners only** (relaxed limits: 25 perm-req/day, 100/week, nudge at 5, revoke at 10). Test numbers exempt from the 2,000-recipient rule.
- **Production prerequisites:** number on **Cloud API** (not the WhatsApp Business *app*); app subscribed to the WABA + `calls` webhook field (unless SIP); `whatsapp_business_messaging` (+ management) permission; **daily messaging limit ≥ 2,000 unique recipients**; **App mode = Live** for SIP; **calling enabled** in phone-number call settings; payment method for outbound.

### A.11 Hard limitations to design around
- **Outbound business-number country block:** US, Canada, Egypt, Vietnam, Nigeria (the *business* number's country code).
- **Outbound permission friction** (§A.5) — not a mass-dialer channel.
- **SIP ⇄ Graph API are mutually exclusive**; SIP hides webhooks by default + no SDP in them.
- **Restrictions:** high report/block → 7-day `RESTRICTED_*_CALLING` (email + `account_update` webhook); low pickup → call button hidden (`RESTRICTED_USER_INITIATED_CALLING_CALL_BUTTON_HIDDEN`, `account_violation`). **We must keep pickup high and reports low.**
- **WebRTC operational cost:** you terminate a real SRTP/DTLS/OPUS peer connection per call (media server), with tight accept/media timing.

---

## PART B — Why this is a strong fit for VocalIQ (what already exists)

| WhatsApp Calling needs | VocalIQ already has | File(s) |
|---|---|---|
| WABA + phone number + Graph API + access token | **WhatsApp Cloud API sender** | `apps/api/src/messaging/senders.ts` (`WhatsAppSender` → `graph.facebook.com/v20.0/{phoneNumberId}/messages`) |
| Meta webhook receipt + **HMAC-SHA256 (X-Hub-Signature-256)** verification | **`verifyMetaSignature`** + raw-body messaging webhooks | `apps/api/src/messaging/webhook-verify.ts`, `apps/api/src/main.ts` (raw-body `/public/messaging/whatsapp/:tenantId`) |
| A **WebRTC/OPUS media endpoint** running an AI loop (STT→LLM→TTS) | **LiveKit/Pipecat voice service** | `apps/voice/app/calls/livekit_service.py`, `apps/voice/app/loop/livekit_agent.py` |
| A **telephony transport seam** (add a carrier via config, not a rewrite — golden rule #2) | **provider-router telephony adapters** | `packages/provider-router/src/adapters/{twilio,telnyx,plivo}.ts` + the "Telephony/media contracts" section |
| **Per-call cost metering** + tenant wallet | **cost + wallet + UsageRecord** | `apps/api/src/cost/*`, `apps/api/src/wallet/wallet.service.ts` |
| **SIP** engine (if we choose SIP mode) | **SIP trunk module** (gated) | `apps/api/src/sip/*`, `apps/voice/app/telephony/*` |
| Number provisioning, agents, flows, campaigns, memory, analytics | full base build | across `apps/api` |

**Net:** ~40–50% of the plumbing (WABA auth, Meta webhooks/HMAC, WebRTC media loop, telephony seam, cost) is reusable. The genuinely new work is **call signaling (Graph API `/calls`)**, a **WhatsApp↔AI WebRTC media bridge**, a **permission manager**, **call-settings management**, and **cost metering for WhatsApp minutes**.

---

## PART C — Integration architecture (design)

### C.1 Recommended: **Graph-API + WebRTC** (default mode), not SIP
**Why:** (a) reuses the existing Meta-webhook seam and keeps the **full call lifecycle** (connect/status/terminate + `duration`) which we **need** for cost attribution + analytics; (b) the voice service is already WebRTC/OPUS-native (LiveKit/Pipecat), so no Asterisk to run; (c) SIP mode is exclusive with Graph API and strips webhooks/SDP. **Keep SIP as a Phase-2 option** for tenants who already run a PBX (reuse the `sip` module + the Asterisk recipe from Meta's docs, incl. the `rewrite_contact=no` / Record-Route ACK fix that otherwise drops calls at ~32 s).

### C.2 End-to-end flow (inbound, recommended path)
```
WhatsApp user taps "Call"  ──►  Meta  ──(HTTPS "calls" webhook, SDP offer)──►  apps/api  (verify HMAC, tenant-scope)
                                                                                   │
                                                          route to the number's agent (flow/persona) + build call record
                                                                                   ▼
                                                        apps/voice  (WhatsApp WebRTC bridge)  ── generates SDP answer
                                                                                   │
   apps/api  POST /<PNID>/calls action=pre_accept(answer) → accept(answer)  ◄──────┘
                                                                                   ▼
   WhatsApp  ◄══ SRTP/OPUS media (peer) ══►  apps/voice WebRTC bridge  ⇄  Pipecat loop (Deepgram STT → LLM → ElevenLabs TTS)
                                                                                   │
                                          on hangup → Terminate webhook (duration) → cost/wallet meter + analytics
```

### C.3 Components to build (mapped to the repo)

**1) Provider-router adapter — `WhatsAppCallingTelephony`** (`packages/provider-router/src/adapters/whatsapp-calling.ts`)
- Implements the telephony contract behind the router seam (like Twilio/Telnyx/Plivo). Methods: `placeCall()` (`POST /<PNID>/calls action=connect` + business SDP offer), `answer()/preAccept()/accept()/reject()/terminate()` (`/calls`), `sendCallPermissionRequest()`, `getCallPermission()`, `updateCallSettings()`. Vendor-specific code lives ONLY here (golden rule #2). Emits a `UsageRecord` per call.

**2) API module — `apps/api/src/whatsapp-calling/`**
- `whatsapp-calling.service.ts` — orchestrates signaling; talks to the adapter (BYOK/managed key resolution); tenant-scoped via `withTenant` (RLS).
- `whatsapp-calling.webhooks.ts` — extend the **existing** raw-body Meta webhook handler to route `field:"calls"` events (`connect`/`terminate`) and `statuses[].type:"call"` + `call_permission_reply`. Reuse `verifyMetaSignature`. Idempotent by WACID.
- `whatsapp-call-settings.service.ts` — `GET/POST /<PNID>/settings` (calling hours, icons, callback permission, voicemail, codecs, SIP). Store tenant config in the number/settings model.
- `whatsapp-permissions.service.ts` — send permission requests/templates, cache `temporary` expiry (since expiry has **no** webhook), enforce the 1/day-2/week + 100/day caps *before* dialing.
- Routes mounted under the messaging/number surface; SUPER-ADMIN/config-writer gated for settings.

**3) Voice service — WhatsApp WebRTC media bridge** (`apps/voice/app/telephony/whatsapp_webrtc.py`)
- Terminates a **raw WebRTC peer** with Meta (ICE+DTLS+SRTP, OPUS 48 kHz) — via `aiortc` (Python) or Pipecat's WebRTC transport — **not** the LiveKit SFU (this is a P2P leg to Meta). Parses the caller SDP offer, generates the SDP answer (returned to `apps/api` for `pre_accept`/`accept`), and pipes decoded audio into the **existing Pipecat loop** (`loop/livekit_agent.py` reused as the AI brain) and back out. Sends the **first SRTP packet** (Meta requires the business side to). Handles DTMF (RFC 4733, 8 kHz) inband.
- A thin control channel (HTTP/gRPC) between `apps/api` (signaling) and `apps/voice` (media) so the answer SDP round-trips within the 30–60 s window.

**4) Cost + wallet** — a WhatsApp-calling price table (per-country, per-minute, 6-s pulse, **inbound = 0**) in `packages/provider-router/src/pricing.ts` + `apps/voice/app/providers/pricing.py`; meter from the Terminate `duration`; attribute to tenant (and reseller margin) exactly like PSTN.

**5) Data model (`packages/db`)** — additive:
- `Call` gets a `channel = "WHATSAPP"` value + `waCallId` (WACID), `direction`, `cta_payload`/`deeplink_payload` (context), `permissionStatus`.
- `WhatsAppCallSettings` (per phone number: hours/icons/callback/voicemail/codec/SIP) — or fold into the existing number `settings` JSON.
- `WhatsAppCallPermission` (tenant, contact/wa_id, status, expiresAt, source) — because expiry has no webhook, we track it.
- RLS `tenant_isolation` on every new table (new-table checklist).

**6) Web (`apps/web`)** — a "WhatsApp Calling" panel: enable/disable per number, calling-hours editor, call-icon + callback-permission toggles, voicemail announcement upload, a permission-status inspector, and WhatsApp calls surfaced in the existing Calls/Analytics views (channel = WhatsApp). A **click-to-call deep-link / call-button generator** for the tenant's site/ads.

### C.4 Cross-cutting (golden rules)
- **Multi-tenancy:** every call/permission/setting keyed to `tenantId`; the webhook path resolves tenant from `phone_number_id` (already the pattern in messaging). RLS + app guard.
- **BYOK & managed:** the WABA/token is the tenant's (BYOK) or the platform's (managed, marked-up minutes) — resolve via the key vault/keypool, same as other providers.
- **Cost on every call:** no WhatsApp calling path ships without a `UsageRecord` + wallet debit (inbound = 0 but still logged for analytics; outbound = metered).
- **Security:** verify **X-Hub-Signature-256** on every webhook; never log tokens/SDP secrets; SDP/ICE from Meta treated as untrusted input; SSRF-safe (media only to Meta's negotiated candidates).
- **Gated/demo pattern:** if a tenant has no WABA calling enabled, the feature degrades to a Demo/Setup state (same pattern as messaging/number-provisioning).

---

## PART D — The innovative AI engine (blend AI agent × WhatsApp Calling)

These are the differentiators that make it more than "another carrier":

1. **Context-aware AI answering.** The Connect webhook carries **`cta_payload`** (which call button) and **`deeplink_payload`** (which `wa.me/call` link / ad / QR). The AI agent **opens the call already knowing intent** — "Hi, I see you're calling about your *order #A1234*…" — by mapping the payload → flow/persona/variables. No IVR menu. (Set the payload when generating the button/link.)
2. **Chat ↔ call fusion (one thread).** WhatsApp keeps message + call in one thread. The agent can **switch modalities**: mid-chat it sends a `voice_call` button ("prefer to talk? tap to call"), and after the call it drops a **chat summary + next steps** into the same thread — using VocalIQ's existing WhatsApp `messaging` sender + the call transcript/intel.
3. **Deflection + calling-hours intelligence.** Outside `call_hours`, or when the agent is saturated, WhatsApp shows "chat / request callback". The AI **captures the callback request in chat**, qualifies it, and (with permission) **schedules an outbound WhatsApp call** in-hours — turning missed calls into booked callbacks (reuses the `callbacks` module).
4. **Permission-and-callback automation.** The agent runs the permission dance for outbound: after a good chat/call it triggers `callback_permission_status`, or sends a permission-request template, tracks the 7-day temporary window (no expiry webhook → we time it), and only dials when `getCallPermission` says `can_perform_action` — **never tripping the auto-revoke** (keeps 4-unanswered from killing the relationship).
5. **AI voicemail → structured lead.** On `REJECT`/`TIMEOUT`, WhatsApp voicemail arrives as an audio message (WACID-correlated). Pipe it through **Deepgram STT → intel/sentiment/lead extraction** (existing workers) → a structured lead + an AI-drafted follow-up. Voicemail becomes data, not a chore.
6. **Cross-channel memory & identity.** Same contact `wa_id`/BSUID across WhatsApp chat, WhatsApp call, and PSTN → **one unified memory** (existing `memory` module). The agent remembers the last chat when the call connects.
7. **Cost-smart routing (router brain).** For an outbound to a WhatsApp user, the router can **prefer WhatsApp Calling** when the destination is expensive on PSTN and WhatsApp is cheaper/free-inbound, or when the business number is in a blocked country → **fall back to PSTN/SIP** automatically. WhatsApp becomes one more least-cost route behind the same `dial` API.
8. **Zero-download, branded, encrypted voice.** The agent reaches ~3B WhatsApp users with **verified brand identity + E2E-grade SRTP**, no phone number to dial, no app install — a better funnel for click-to-call from ads/web/QR than a tel: link.

---

## PART E — Use cases (where it wins / doesn't)

**Wins (do these first):**
- **Inbound AI reception on WhatsApp** (free, global, no permission) — support, order status, bookings, FAQ, triage → transfer. *Highest ROI, lowest friction.*
- **Click-to-call from web/ads/QR** (`wa.me/call` + payload) → AI answers with context.
- **Warm outbound with consent** — post-purchase follow-up, appointment reminders, renewals, verification — to users who opted in (permission/callback), in-hours, low volume, high intent.
- **AI voicemail capture** after hours.
- **Chat-to-call escalation** inside an existing WhatsApp support thread.

**Weak / avoid:**
- **Cold mass outbound / robo-dialing** — permission model (1–2 req/week, 4-unanswered revoke) + reports/restrictions make this a non-starter (and against policy). Use PSTN campaigns for cold.
- **Outbound from US/CA/EG/VN/NG business numbers** — blocked; use a business number in a supported country or route via PSTN.
- **Desktop-originated calls / non-phone devices** — unsupported.
- **DTMF-heavy IVR** — DTMF has no webhook + 8 kHz only; prefer natural-language turns (which is VocalIQ's strength anyway).

---

## PART F — Advantages / disadvantages / scope

**Advantages:** reuses ~half the stack; inbound is free + global; verified brand + encrypted media; rich **context payloads** for smart AI answering; unified chat+call thread + cross-channel memory; a new least-cost outbound route; no app install for ~3B users; per-minute outbound billing fits the existing metered/reseller model.

**Disadvantages / risks:** WebRTC media termination is real engineering (SRTP/DTLS/OPUS, first-packet rule, 30–60 s accept window, media server ops/scaling); outbound permission + rate + country limits; low-pickup/report **restrictions** can hide your call button; SIP mode is all-or-nothing; Meta API/limits change quarterly (Dec-2025 raised perm to 100/day, Jan-2026 feedback restrictions, Mar-2026 G.711 section) → keep an adapter, don't hard-wire; sandbox is Tech-Partner-only.

**Scope (v1):** inbound AI answering (Graph-API+WebRTC), call-settings + calling-hours, voicemail→AI, cost metering, analytics, web panel, click-to-call generator. **v2:** consented outbound + permission automation + least-cost routing. **v3:** SIP mode for PBX tenants; video/screen-share when Meta GA's them.

---

## PART G — Prerequisites (admin / Meta) — the 🔑 ADMIN ACTION list
1. **WhatsApp Business Account (WABA)** + a **phone number on Cloud API** (not the consumer app) — VocalIQ already uses this for messaging; confirm the same number.
2. **App permissions:** `whatsapp_business_messaging` (+ `whatsapp_business_management`); app subscribed to the WABA + the **`calls`** webhook field.
3. **Messaging limit ≥ 2,000** unique recipients (required to enable calling) — or a **public test number / sandbox** (Tech-Partner) for dev.
4. **Enable Calling** in the number's call settings (`POST /<PNID>/settings` `calling.status=ENABLED`).
5. **Payment method** on the WABA (required for outbound).
6. **Outbound country check:** business number must NOT be US/CA/EG/VN/NG for business-initiated.
7. **(SIP only)** App mode **Live**, a TLS SIP server (Asterisk/Kamailio) with digest auth, valid cert (no mTLS).
8. **Business verification / brand identity** for production.
9. Confirm **BYOK vs managed** for the WABA token, and the **cost markup** for WhatsApp minutes.

## PART H — Technical requirements
- **WebRTC media stack** in `apps/voice` that can do SDP offer/answer + ICE + **DTLS-SRTP** + **OPUS 48 kHz** (aiortc or Pipecat WebRTC), send the **first SRTP packet**, and bridge to the AI loop; DTMF RFC 4733 @ 8 kHz.
- **Public HTTPS webhook** (already have) with **X-Hub-Signature-256** verification + raw body; low-latency signaling so `accept` lands inside 30–60 s.
- **Media server capacity/scaling** for concurrent SRTP legs (co-locate with STT/TTS to keep latency < the ~800 ms target).
- **Graph API client** (reuse messaging's) for `/calls`, `/settings`, `/call_permissions`, `/message_templates`.
- **State store** for permissions (expiry timers), call lifecycle (idempotent by WACID), and settings.
- **Observability:** per-call events, restriction/violation `account_update` webhooks → alerts; pickup-rate + report-rate dashboards (to avoid restrictions).

## PART I — Cost model & attribution
- **Inbound = $0** but still logged (UsageRecord, `channel=WHATSAPP`, `billableCents=0`) for analytics/margin visibility.
- **Outbound = per-country per-minute, 6-s pulses, only-if-answered**, tiered monthly → a `whatsapp_calling` price table keyed by destination country + tier; meter from Terminate `duration`; debit wallet + accrue reseller margin exactly like PSTN (existing `chargeCall`). Never ship a WhatsApp call path without this (golden rule #4).

---

## PART J — Phased build plan (super-prompt style, one PR per slice)

> Mirrors the parity/day discipline: read → prereqs → build + tests → A–K self-audit → commit/push → PR → CI-green → merge → BUILD-LOG.

- **WAC-00 — Spike & sandbox (🧠 Opus).** Tech-Partner sandbox; prove one **inbound** call end-to-end with a throwaway WebRTC bridge (aiortc): receive Connect webhook → SDP answer → pre_accept/accept → 5-second tone both ways → terminate. De-risks the media path. *No product code; findings → BUILD-LOG.*
- **WAC-01 — Provider-router `WhatsAppCallingTelephony` adapter + pricing** (behind the seam; unit-tested with a fake HTTP; UsageRecord emitted).
- **WAC-02 — Webhook + signaling service** (extend Meta webhook for `field:"calls"`, tenant-scope by `phone_number_id`, idempotent WACID, `pre_accept`/`accept`/`reject`/`terminate`; call record with `channel=WHATSAPP`, payloads).
- **WAC-03 — Voice-service WhatsApp WebRTC bridge** (raw peer to Meta ↔ existing Pipecat loop; first-SRTP-packet; DTMF; the api↔voice answer-SDP control channel).
- **WAC-04 — Inbound AI answering GA** (route number→agent/flow, context from `cta_payload`/`deeplink_payload`, calling-hours gate, transcription/recording, analytics channel). *Ship inbound.*
- **WAC-05 — Call settings + voicemail** (`/settings`: hours/icons/callback/codecs; voicemail announcement upload; voicemail→STT→lead worker; `account_settings_update`).
- **WAC-06 — Cost metering + wallet** (WhatsApp price table, Terminate-duration metering, reseller margin, dashboards).
- **WAC-07 — Web panel + click-to-call generator** (enable/hours/voicemail UI; deep-link + call-button builder with payloads; WhatsApp calls in Calls/Analytics).
- **WAC-08 — Permissions + consented outbound** (permission request/template send, expiry tracking, `getCallPermission` pre-dial gate, `action=connect` outbound, status webhooks; auto-revoke avoidance).
- **WAC-09 — Least-cost routing + restriction guardrails** (router prefers WhatsApp when cheaper/allowed, PSTN fallback for blocked countries; pickup/report-rate monitors → auto-throttle to dodge `RESTRICTED_*`).
- **WAC-10 (opt) — SIP mode** for PBX tenants (reuse `sip` module + Asterisk recipe incl. the Record-Route/`rewrite_contact=no` ACK fix).
- **WAC-11 (opt) — Video / screen-share** when Meta GA's them.

## PART K — Risks & mitigations
| Risk | Mitigation |
|---|---|
| WebRTC/SRTP/DTLS media termination is hard | WAC-00 spike first; use battle-tested aiortc/Pipecat; co-locate media with STT/TTS |
| 30–60 s accept window + first-packet rule → clipped/silent audio | `pre_accept` early; flow media only after `accept` 200 OK; send first SRTP packet |
| Outbound permission/rate/revoke traps | Permission manager tracks expiry (no webhook), pre-dial `getCallPermission` gate, back off on unanswered |
| `RESTRICTED_*` from low pickup / reports | Monitor pickup + report rates; keep call button honest; deflect when saturated |
| Country block (US/CA/EG/VN/NG business #) | Detect + route via PSTN; document to admin |
| Meta changes API/limits quarterly | All Meta specifics live in ONE adapter (golden rule #2); pin Graph API version; note deltas in BUILD-LOG |
| Cost leakage | UsageRecord on every path; reconcile Terminate `duration` vs wallet |

## PART L — Open decisions for the admin (need answers before WAC-01)
1. **Same WABA/number** as WhatsApp messaging, or a dedicated calling number? (country matters for outbound).
2. **BYOK vs managed** WABA token + the **markup** on WhatsApp minutes.
3. **Sandbox access** — are we/what tenant is a **Meta Tech Partner** (needed for sandbox)? Otherwise dev on a public test number.
4. **v1 scope = inbound-only?** (recommended) vs inbound+outbound together.
5. **Media host** — extend the existing voice service, or a dedicated WhatsApp-WebRTC media pod for scaling?
6. **SIP mode needed** for any target tenant, or Graph-API+WebRTC only for now?

---

## Sources (Meta official docs, read 2026-07-16)
- Calling overview — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling
- User-initiated (inbound) — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls
- Business-initiated (outbound) — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls
- SIP configuration — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip
- Integration examples (Asterisk) — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/integration-examples
- Call settings — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings
- User call permissions — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions
- Call button messages & deep links — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-button-messages-deep-links
- Pricing — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing
- Sandbox — https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sandbox
