# VocalIQ — Project Features Explained

> **Yeh file kya hai:** VocalIQ platform ke **har feature/module** ki ek jagah, simple Hinglish mein list — uska **role** (kya kaam karta hai) aur **type** (native / third-party / hybrid).
> **Maintenance rule:** Jab bhi koi **naya feature** project mein add ho, use isi file mein (sahi section mein) append karna hai, phir `.docx` regenerate karna hai. `.md` = source of truth, `.docx` iski copy hai. Dono ka naam same rehta hai: `PROJECT-FEATURES-EXPLAINED`.
> **DOCX kaise banega:** `python3 scripts/gen-features-docx.py` chalao — yeh isi `.md` se `PROJECT-FEATURES-EXPLAINED.docx` bana deta hai.

## Legend (type ka matlab)

| Tag | Matlab |
|---|---|
| 🏠 Native | Humne khud banaya — code apna hai. |
| 🔌 3rd-party | Bahar ke vendor/service ka integration. |
| 🔀 Hybrid | Framework native hai, par pichhe vendor plug hote hain (provider-router pattern — vendor swap = sirf config change). |
| (gated) | Feature bana hua hai par real keys/credentials milne tak live test pending; abhi mock/stub pe chalta hai. |

---

## 1. 🧠 Provider Router + AI Brain (yeh platform ka dil hai)

| Feature | Role | Type |
|---|---|---|
| Provider Router (`packages/provider-router`) | Saare LLM/STT/TTS/telephony calls yahin se route hote hain. Naya vendor add karna = config, code nahi. | 🏠 Native framework |
| OpenAI adapter | LLM (GPT models) se agent ka dimaag chalta hai. | 🔌 3rd-party |
| Anthropic adapter | LLM (Claude models) — alternate/fallback brain. | 🔌 3rd-party |
| OpenRouter adapter | Ek key se 100+ LLMs ka access (multi-model aggregator). | 🔌 3rd-party |
| Deepgram adapter | STT — caller ki awaaz ko text mein badalta hai. | 🔌 3rd-party |
| ElevenLabs adapter | TTS + voice cloning — agent ki awaaz banata hai. | 🔌 3rd-party |
| LiveKit adapter | Real-time audio media transport (WebRTC). | 🔌 3rd-party |
| Twilio adapter | Phone calls (PSTN) place/receive + numbers. | 🔌 3rd-party |
| Telnyx adapter | 2nd carrier — numbers + Call Control telephony. | 🔌 3rd-party |
| Plivo adapter | 3rd carrier telephony (parity feature). | 🔌 3rd-party |
| Pricing engine (`pricing.ts`) | Har vendor ka rate table — cost calculate karne ke liye. | 🏠 Native |
| Models / model registry | Kaunsa LLM available hai, uski config + selection. | 🏠 Native |

---

## 2. 📞 Voice / Calling Engine

| Feature | Role | Type |
|---|---|---|
| Voice service (`apps/voice`, Python FastAPI) | Real-time call loop — sunna → sochna → bolna, sab kuch live. | 🔀 Hybrid (Pipecat/LiveKit) |
| Twilio dialer (voice) | Call ko actually PSTN pe uthhata/dial karta hai. | 🔌 3rd-party |
| AMD (answering machine detection) | Pata karta hai insaan uthaya ya voicemail. | 🏠 Native |
| Tool executor + SSRF guard | Agent call ke beech external API/tool call kar sake, safely. | 🏠 Native |
| calls module | Call records, instant dial, disposition tracking. | 🏠 Native |
| s2s (speech-to-speech) | Direct voice-to-voice realtime mode (low latency). | 🔀 Hybrid |
| sip module | SIP trunk se calls (enterprise telephony). | 🔌 3rd-party (gated) |
| numbers module | Phone number search/buy/release (Twilio + Telnyx). | 🔀 Hybrid |
| reputation | Caller ID reputation / STIR-SHAKEN — spam-flag se bachaav. | 🔀 Hybrid |
| widget | Website pe "call us" web widget (browser se voice call). | 🔀 Hybrid (LiveKit) |
| WhatsApp Calling — adapter + control plane (WAC-01/02) | WhatsApp par AI agent voice call — Meta ka calling API router-seam ke peeche; webhook lifecycle idempotent + HMAC-verified. | 🔌 3rd-party (Meta, gated) |
| WhatsApp Calling — settings (WAC-05) | Business hours, call-button visibility, callback permission, voicemail — sab Meta se sync. | 🔀 Hybrid |
| WhatsApp Calling — cost metering (WAC-06) | Har WhatsApp call ka cost attribute — inbound free, outbound per-country 6-s pulse + monthly tier. | 🏠 Native |
| WhatsApp Calling — dashboard + click-to-call (WAC-07) | Lovely home: status hero, aaj ke KPIs, recent calls + click-to-call generator (deep link · QR · website button) with agent context payload. | 🔀 Hybrid (qrcode.react) |
| WhatsApp Calling — WebRTC media bridge (WAC-00/03) | Meta se raw WebRTC peer (ICE+DTLS-SRTP+OPUS) terminate karke wahi AI loop (STT→LLM→TTS) mein bridge — aiortc; internal api→voice control hop (authed). Live media creds pe gated. | 🔀 Hybrid (aiortc) |
| WhatsApp Calling — inbound AI answering GA + live-call view (WAC-04) | Customer WhatsApp par "call" tap kare → sahi agent context ke saath answer kare: number→agent routing (PhoneNumber assignment reuse), tapped-button context (`intent`/`campaign`/`reference`) agent ke system prompt mein inject, calling-hours gate (tz-correct, band ho to graceful reject), aur ek unified `Call(channel=WHATSAPP)` khul ke recording/transcription/analytics/cost mein flow kare. Web: signature cyan waveform wala live-call view (reduced-motion safe) + Calls feed channel filter (All·Phone·Web·WhatsApp) + WhatsApp badge. | 🏠 Native (media gated) |
| WhatsApp Calling — consented outbound + permission governor (WAC-08) | AI agent business→user WhatsApp call kar sake — par sirf consent ke saath, poori tarah guard-railed. Permission engine: temporary(7d)/permanent grant track (Meta ka expiry webhook nahi → local clock se lazily expire), 4-unanswered auto-revoke back-off, 1/24h+2/7d request send-caps, ≤100 connected/24h cap, US/CA/EG/VN/NG business-number block, DNC — sab **dial se PEHLE** enforce (`canCall` gate). Outbound placeCall: gate → business SDP offer → adapter dial → answer apply → terminate meter. Web: permission inspector + "Call now" (sirf allowed hone pe enabled) — koi cold/bulk dialing nahi. | 🏠 Native (media gated) |
| WhatsApp Calling — least-cost routing + guardrails (WAC-09) | Ek outbound intent apne aap **sabse sasta ALLOWED route** chune — WhatsApp vs PSTN — per-tenant policy (whatsapp-preferred / pstn-preferred / cheapest / if-permitted) se, par kabhi permission-gate / restriction / low-pickup ke against nahi; decision ka transparent reason record. Pickup-rate (7d) gire to **auto-throttle** (Meta ke low-pickup RESTRICTED_* se pehle) + Meta ka `account_update` restriction persist (local 7-day expiry) → us direction ko route-around + health banner. Web: "Calling health" widget (pickup, throttle, restriction+remediation, tier). | 🏠 Native |
| WhatsApp Calling — SIP mode for PBX tenants (WAC-10, optional) | Jo tenant apna SIP PBX (Asterisk/Kamailio) chalata hai, uska WhatsApp number **SIP-over-TLS** se apne PBX ke through bridge kar sake (Graph-API+WebRTC ke bajaye) — per-number opt-in, Graph tenants ko chhua nahi jaata (mixing guard). `sip` settings block Meta se sync (servers/SDES-ya-DTLS/webhook_delivery), Meta-generated digest creds fetch (gated). SIP mode mein `calls` webhook nahi → call ko `x-wa-meta-*` headers (WACID + duration) se correlate + meter (WAC-06). Asterisk runbook diya — **Record-Route/`rewrite_contact=no` ACK fix** (warna ~32s pe call drop) + no-mTLS. Live SIP signaling/media real TLS SIP server aane pe. | 🔀 Hybrid (gated) |
| WhatsApp Calling — video/screen-share GA-gate (WAC-11, optional) | Meta ne WhatsApp video/screen-share abhi GA nahi kiya ("in development") — to hum unpublished spec pe SDP negotiate nahi karte (golden rule #15). Honest seam ship kiya: `WHATSAPP_VIDEO_GA=false` + `whatsappCallMediaMode()` jo har call ko **audio-only** rakhta hai (video request safely voice pe degrade), api/voice mein `video` field plumbed-par-inert (gated), aur ek GA-ready design note (`docs/runbooks/whatsapp-calling-video-design.md`: flag flip → m=video negotiation → avatar/Agent-Desk → live-call video pane + audio-only fallback → metering). Live video Meta GA pe. **Ye WhatsApp Calling module complete karta hai.** | ⛔ Gated (not GA) |
| Messenger Calling — foundation: adapter + pricing + entry-points (MEC-01) | WhatsApp Calling ka sibling: Meta ka **Messenger Platform Calling API** (Facebook **Page** ↔ Messenger **PSID** pe WebRTC voice, `pages_messaging`). Foundation ship kiya, poori tarah gated + offline-testable: router-seam ke peeche `MessengerCallingTelephony` adapter (Page=`me`, PSID recipient, Graph signaling; token/SDP kabhi log nahi), Messenger call **pricing** (flat, free-tier default $0 — koi country dial-code nahi kyunki Messenger mein phone number hi nahi — par har call phir bhi metered), `m.me` **entry-point + context-payload** helper (ref ka restricted charset handle karne ko base64url — WhatsApp ke `wa.me/call` se ye bada farq), `Provider`+`CallChannel` enum sync (shared+Prisma) + audio-only media gate. **Big smart differences vs WhatsApp:** PSID identity (no phone), **no PSTN least-cost routing (WAC-09 N/A)**, **no SIP mode (WAC-10 N/A)**. Meta ka low-level wire format `[CONFIRM @ MEC-00]` — sirf adapter file badlegi. Plan: `docs/MESSENGER-CALLING-AI-ENGINE-PLAN.md` (MEC-00…08). | 🔌 3rd-party (Meta, gated) |
| Messenger Calling — webhook + signaling control plane (MEC-02) | Inbound-first control plane (WAC-02 ka sibling): `MessengerCall` + `MessengerCallEvent` DB models (PSID + Page identity, koi phone number nahi) — dono tenant-scoped RLS. `MessengerCallingService` lifecycle: `onConnect` (route → media SDP-answer → adapter pre_accept/accept → unified `Call(channel=MESSENGER)` khole), `onStatus`, `onTerminate` (persist → media teardown → meter → close call) — sab **idempotent by Meta call id**, `withTenant` RLS scope. `dispatchMessengerCallingWebhook` same (HMAC-verified) Messenger webhook route pe call events handle kare (`entry[].messaging[].call` shape + WhatsApp-style fallback, `[CONFIRM @ MEC-00]`), 200-to-Meta kabhi fail nahi. `MeMediaControl` contract (Pending stub + Http→voice bridge, `X-Internal-Secret`, fail-soft). Router/meter **optional** (MEC-04/06 wire karenge). Composition + main.ts wired; outbound + permissions MEC-08. | 🏠 Native (media gated) |
| Messenger Calling — voice-service WebRTC media bridge (MEC-03) | Meta se raw WebRTC peer (ICE+DTLS-SRTP+OPUS) terminate karke wahi transport-neutral AI loop (STT→LLM→TTS) mein bridge — WhatsApp WAC-03 ka sibling, aiortc. `MessengerMediaBridge`: `answer()` (inbound caller SDP offer → non-trickle ICE answer + loop start), `offer()`/`apply_answer()` (outbound MEC-08), `end()` (idempotent teardown); 48k⇄16k resample, 20ms agent frames (silence-padded, first-SRTP rule), har failure (ICE/DTLS/hangup) pe clean teardown. `/calls/messenger/*` internal control endpoints (`X-Internal-Secret` constant-time, unset→503 gated, kabhi public nahi; aiortc lazily import so control surface bina native stack ke importable). **Smart reuse:** WhatsApp ke WebRTC audio adapters ko shared `webrtc_audio.py` mein generalize kiya — dono channels ek hi implementation use karte hain (`whatsapp_audio.py` ab thin re-export shim, WAC untouched). Pure unit tests (aiortc-free); live media Meta creds + MEC-00 pe gated. | 🔀 Hybrid (aiortc) |
| Messenger Calling — inbound AI answering GA (MEC-04) | Ab inbound Messenger call sahi agent se answer hota hai: `MessengerInboundRouter` tenant ka **first PUBLISHED agent** resolve kare (persona→system-prompt + active flow version) — Messenger mein phone number nahi, isliye WhatsApp jaisa PhoneNumber→agent mapping nahi (Page→agent future). Router `MessengerCallingService` mein wired → call route → media SDP-answer → adapter accept → unified `Call(channel=MESSENGER)` khule + `ref` context brief agent ke prompt mein inject. Dashboard read model: `/messenger-calling/overview` (aaj ke KPIs: calls/answered/avg-duration/cost + is-month minutes, free-tier tier0) + `/messenger-calling/calls/:id` live-call view (identity psid/pageId, `ref`-decoded context, linked agent, status timeline). Routes auth+tenant RLS-scoped. (Web live-call UI MEC-07 ke saath aayega.) | 🏠 Native (media gated) |
| Messenger Calling — per-call cost metering (MEC-06) | Golden rule #4: koi calling path bina cost attribution ke ship nahi. `MessengerCallCostService.meterTerminated` har terminate pe: **atomic `billedAt` claim** (idempotent — replayed terminate double-meter nahi karta) → `messengerCallCostUsd(seconds, direction, 0)` → `UsageRecord(Provider.MESSENGER, TELEPHONY, costUsd, units=seconds, byok=false)` → `MessengerCall.costUsd` stamp. **WhatsApp se farq:** Messenger free-tier hai (flat, no per-country card, no volume-tier table) → inbound + outbound dono abhi **$0** log karte hain (par phir bhi metered — analytics/billing views mein PSTN/WhatsApp jaisa roll-up). `Provider.MESSENGER` enum MEC-01 mein add ho chuka; `costUsd`/`billedAt` columns MEC-02 mein ready the. Meter composition mein `MessengerCallingService` mein wired (NoopMeCallMeter → real). Tiering tabhi jab Meta koi rate publish kare. | 🏠 Native |

---

## 3. 🎨 Agent Builder & Conversation Design

| Feature | Role | Type |
|---|---|---|
| agents module | AI voice agent banane/config karne ka core (persona, voice, model). | 🏠 Native |
| flows module | Visual node-builder ka compiler — nodes ko chalne-layak logic mein badalta hai. | 🏠 Native |
| Node builder canvas (web, React Flow) | Drag-drop se conversation flow design karna. | 🔀 Hybrid (React Flow lib) |
| templates | Ready-made agent templates (jaldi start ke liye). | 🏠 Native |
| squads | Ek se zyada agents ka team (specialized handoff). | 🏠 Native |
| rag module | Knowledge base — agent apne docs se jawab de (embeddings + pgvector). | 🔀 Hybrid |
| memory module | Agent ko contact ki past baatein yaad rahein (opt-in, GDPR erase). | 🏠 Native |
| voices module | Voice selection + cloning management. | 🔌 3rd-party (ElevenLabs) |
| translation | Real-time multilingual translation call ke beech. | 🔀 Hybrid (LLM) |
| disclosure | "Yeh AI hai" legal disclosure caller ko batana. | 🏠 Native |
| test panel / simulator | Agent ko deploy se pehle test karna. | 🏠 Native |

---

## 4. 📢 Campaigns, Leads & Outreach

| Feature | Role | Type |
|---|---|---|
| campaigns module | Bulk outbound calling campaigns (schedule, queue, live status counts, retry failed). | 🏠 Native |
| leads module | Lead capture, list, workspace. | 🏠 Native |
| callbacks | Scheduled callback booking + auto-dial. | 🏠 Native |
| appointments | Appointment booking (Google Calendar 2-way sync — gated). | 🔀 Hybrid |
| forms module | Form builder + hosted `/f/[id]` page → lead capture. | 🏠 Native |
| Form-to-Call (parity) | Form submit hote hi submitter ko seconds mein call. (owner's flagship) | 🏠 Native |
| experiments | A/B testing agents/scripts. | 🏠 Native |
| email module | Email campaigns (marketing domain SPF/DKIM). | 🔌 3rd-party |

---

## 5. 📊 Analytics & Intelligence (post-call brain)

| Feature | Role | Type |
|---|---|---|
| analytics + analytics-api | Call dashboards, metrics, weekly trend tiles, CSV + PDF export. | 🏠 Native |
| intel module | Post-call intelligence — summary, key points nikalna. | 🔀 Hybrid (LLM) |
| sentiment | Caller ka mood/sentiment analysis. | 🔀 Hybrid (LLM) |
| qa module | Automatic call quality scoring (rubric-based). | 🔀 Hybrid (LLM) |
| search module | Calls/transcripts mein full-text + semantic search. | 🏠 Native |
| transcription | Call recording → transcript + controls (redaction). | 🔌 3rd-party (Deepgram) |
| coach / battlecards | Live agent coaching hints during call. | 🏠 Native |
| learning | Agent performance se seekhna / fine-tune data. | 🔀 Hybrid |
| benchmarking | Batch testing — kai agents/versions ki tulna. | 🏠 Native |
| revenue / outcomes | Revenue attribution + call outcomes analytics. | 🏠 Native |
| copilot | Dashboard mein AI assistant (queries, help). | 🔀 Hybrid (LLM) |
| voice-emotion | Awaaz se emotion detect (expressive analytics). | 🔀 Hybrid |

---

## 6. 🔌 Integrations & Channels

| Feature | Role | Type |
|---|---|---|
| integrations (CRM) | HubSpot sync live; Salesforce/Zendesk framework-ready. | 🔌 3rd-party |
| messaging module | Multi-channel: WhatsApp, SMS, Telegram, RCS. | 🔌 3rd-party (gated) |
| Slack connector (parity) | Per-event notifications Slack channel mein. | 🔌 3rd-party |
| n8n connector (parity) | 400+ apps se connect + ready workflow templates. | 🔌 3rd-party |
| workflows module | Automation workflow builder/execution + run-logs + failed-run retry. | 🏠 Native |
| automations | Event → action rules (executors). | 🏠 Native |
| Notification matrix (followup) | Per-tenant event×channel grid — kaunsa event kaunse channel (webhook/Slack) ko notify kare. | 🏠 Native |
| marketplace | Integrations/automations marketplace. | 🏠 Native |
| mcp module | Model Context Protocol — external tools agent ko dena. | 🏠 Native (open standard) |
| avatars | Video avatar (HeyGen/D-ID/Tavus) — gated, voice fallback. | 🔌 3rd-party (gated) |
| biometrics | Voice biometrics / voiceprint auth — default-deny, gated. | 🔌 3rd-party (gated) |

---

## 7. 💳 Billing, Wallet & Cost

| Feature | Role | Type |
|---|---|---|
| cost module | Har call ka STT+LLM+TTS+telephony cost tenant pe attribute. | 🏠 Native |
| billing module | Subscriptions, plan tiers, invoices. | 🔌 3rd-party (Stripe, gated) |
| payments | Wallet top-up, payment flows. | 🔌 3rd-party (Stripe) |
| wallet module | Prepaid credits balance (managed minutes). | 🏠 Native |
| Promo/bonus credits (parity) | Wallet mein promo/bonus credits — admin grants + redeemable promo codes; paid balance se pehle spend, expire ho sakte hain. | 🏠 Native |
| keypool | Managed provider keys ka pool (BYOK vs managed). | 🏠 Native |

---

## 8. 🏷️ White-label & Reseller

| Feature | Role | Type |
|---|---|---|
| whitelabel | Custom domain + theming (reseller ki apni branding). | 🔀 Hybrid (Cloudflare for SaaS) |
| branding (web) | Logo/colors/theme customization UI. | 🏠 Native |
| reseller module | Reseller hierarchy — sub-tenants, markup, portal. | 🏠 Native |
| vault module | Encrypted key vault (tenant ki apni provider keys). | 🔀 Hybrid (KMS) |
| Plan builder (admin/plans) | Super-admin custom pricing plans banaye. | 🏠 Native |

---

## 9. 🔐 Security, Compliance & Anti-abuse

| Feature | Role | Type |
|---|---|---|
| auth module | Login/signup (email+password). | 🔌 3rd-party (Clerk) |
| sso module | Enterprise SSO/SAML. | 🔌 3rd-party (WorkOS, gated) |
| tenancy module | Multi-tenant isolation core (RLS + guards) — sabse important. | 🏠 Native |
| crypto module | Envelope encryption for secrets. | 🔀 Hybrid (KMS) |
| fraud module | Fraud detection (suspicious calling patterns). | 🏠 Native |
| abuse module | Anti-abuse / call-spam prevention controls. | 🏠 Native |
| compliance | Regulatory compliance controls (per-region). | 🏠 Native |
| residency | Data residency (data kis region mein rahe). | 🏠 Native |
| governance | Feature flags, quotas, audit logs. | 🏠 Native |

---

## 10. 🛠️ Super-admin, Developer & Ops

| Feature | Role | Type |
|---|---|---|
| superadmin module | Platform-level admin (saare tenants dekhna/manage). | 🏠 Native |
| Broadcast announcements (parity) | Super-admin → sabhi tenants ko targeted announcement (severity + notification center). | 🏠 Native |
| public module | Public metered REST API (customers ke liye). | 🏠 Native |
| api-keys | API keys create/manage + scopes. | 🏠 Native |
| developer-apps | OAuth developer apps register karna. | 🏠 Native |
| In-app API reference (parity) | Dashboard mein live API explorer — copy-ready curl + "Try it". | 🏠 Native |
| Check-for-Updates (parity) | Self-host version check — installed vs latest release, read-only (auto-apply nahi). | 🏠 Native |
| sdk package | Public SDK (customers integrate kar sakein). | 🏠 Native |
| ops module | Ops toolkit (support/maintenance tasks). | 🏠 Native |
| desk module | Agent Desk — human live call takeover. | 🏠 Native |
| latency | Latency monitoring/hardening. | 🏠 Native |
| scale | Scaling infra controls. | 🏠 Native |
| launch | Launch-readiness checks. | 🏠 Native |
| observability | Logs/metrics/traces. | 🔀 Hybrid (Sentry/Prometheus) |
| health | Health-check endpoints. | 🏠 Native |

---

## 11. ⚙️ Background Workers (`apps/workers`, BullMQ) — sab 🏠 Native

| Worker | Role |
|---|---|
| campaign-scheduler | Campaigns ko time pe dial karta hai. |
| callback-dialer | Scheduled callbacks auto-dial. |
| post-call-intel | Call ke baad summary/intel process. |
| conversation-intel | Conversation-level deep analysis. |
| qa-scoring | QA score background mein calculate. |
| memory-extraction | Call se memory facts nikalna. |
| workflow-execution | Automation workflows run karna. |
| reconciliation | Cost/billing reconciliation. |
| scheduled-exports | Scheduled CSV/PDF data exports. |

---

## 12. 📦 Packages / Infra (foundation)

| Package | Role | Type |
|---|---|---|
| db | Prisma schema + migrations (Postgres 16 + Timescale + pgvector). | 🔀 Hybrid |
| shared | Shared TS types, Zod schemas, constants. | 🏠 Native |
| ui | Shared React components (shadcn-based). | 🔀 Hybrid |
| config | ESLint/tsconfig/tailwind presets. | 🏠 Native |
| Redis + BullMQ | Queues + cache. | 🔌 3rd-party |
| Socket.IO | Real-time dashboard updates. | 🔌 3rd-party |

---

## 📝 Status Summary — Competitor-Parity phase ✅ COMPLETE

Base build (Day 00–95) **poora** hai, aur **Competitor-Parity phase bhi ab complete** hai — VocalIQ ab IntelliCall AI + AgentLabs AI ka strict **superset** hai.

| Item | Status |
|---|---|
| PARITY-01 Plivo + OpenRouter adapters | ✅ merged (#136) |
| PARITY-02 Instant-dial API | ✅ merged (#137) |
| PARITY-03 AI Form Builder | ✅ (Day-37 delivered) |
| PARITY-04 Form-to-Call | ✅ merged (#138) |
| PARITY-05 n8n connector | ✅ merged (#139) |
| PARITY-06 Slack connector | ✅ merged (#140) |
| PARITY-07 Broadcast announcements | ✅ merged (#142) |
| PARITY-08 Promo/bonus credits | ✅ merged (#143) |
| PARITY-09 In-app API reference | ✅ merged (#144) |
| PARITY-10 Campaign retry (enhancements batch) | ✅ merged (#145) |
| PARITY-11 Self-host installer + update checker | ✅ merged (#146) |

**PARITY-10 follow-ups — ✅ all shipped:** workflow failed-run retry (#148), analytics trend tiles + PDF export (#149), unified notification matrix (#150).
**Live test pending (real keys chahiye):** Twilio, Stripe, SIP, Google Calendar/Sheets, voice biometrics, avatar, messaging channels.
