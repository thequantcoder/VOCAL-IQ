# WhatsApp (Meta) Business Calling — Module Build Index & Day Order (WAC-00 … WAC-11)

> Turns `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` into day-by-day super-prompts that add **WhatsApp Business Calling** as a first-class calling channel + AI-voice-agent transport. Each `WAC-XX` day runs the standard daily loop (`CLAUDE.md §2`): read → confirm prereqs → restate plan → build + tests → self-audit (A–K) → commit/push → PR → CI green → merge → BUILD-LOG.
>
> **Golden path = Graph-API + WebRTC** (not SIP). **Inbound-first** (free, global, no permission) → then consented outbound. Build **strictly in order**; every day is its own branch → PR → merge. Read the plan doc + `DESIGN-SYSTEM.md` before any UI day.

## Build order

| # | Day file | Title | Model | Needs creds? | Notes |
|---|----------|-------|-------|--------------|-------|
| 00 | `WAC-00-sandbox-spike.md` | Sandbox/test-number spike — prove ONE inbound WhatsApp call end-to-end | 🧠 Opus | Meta test number | Throwaway media path (aiortc). **De-risks WebRTC.** No product code. |
| 01 | `WAC-01-router-adapter.md` | `WhatsAppCallingTelephony` provider-router adapter + pricing | 🧠 Opus | — | All Meta specifics behind the router seam. Unit-tested offline. |
| 02 | `WAC-02-webhook-signaling.md` | Meta `calls` webhook + signaling service (pre_accept/accept/reject/terminate) | 🧠 Opus | — | Extend the existing HMAC-verified Meta webhook. Idempotent by WACID. |
| 03 | `WAC-03-webrtc-media-bridge.md` | Voice-service WhatsApp↔AI WebRTC media bridge | 🧠 Opus | — | Terminate Meta's SRTP/OPUS peer → feed the existing Pipecat loop. The hard one. |
| 04 | `WAC-04-inbound-ai-ga.md` | Inbound AI answering GA + **live-call view UI** | 🧠 Opus | — | Ship inbound. Waveform live-call view, calling-hours gate, context routing. |
| 05 | `WAC-05-call-settings-voicemail.md` | Call settings (hours/icons/callback/codecs) + AI voicemail + **settings UI** | ⚡ Sonnet | — | `/settings` + voicemail→STT→lead. Lovely calling-hours editor. |
| 06 | `WAC-06-cost-metering.md` | Cost metering + wallet + reseller margin for WhatsApp minutes | 🧠 Opus | — | Inbound=0 (logged), outbound per-country per-minute (6-s pulse). |
| 07 | `WAC-07-web-panel-clicktocall.md` | WhatsApp Calling dashboard panel + **click-to-call / call-button generator** | ⚡ Sonnet | — | The showpiece UI. Deep-link + `voice_call` button builder with payloads. |
| 08 | `WAC-08-permissions-outbound.md` | Permissions engine + consented outbound calling + **permission inspector UI** | 🧠 Opus | payment method | Expiry tracking (no webhook), pre-dial gate, `action=connect`. |
| 09 | `WAC-09-routing-guardrails.md` | Least-cost routing (WhatsApp vs PSTN) + restriction/pickup guardrails | 🧠 Opus | — | Router prefers cheapest allowed route; auto-throttle to dodge `RESTRICTED_*`. |
| 10 | `WAC-10-sip-mode.md` | (Optional) SIP mode for PBX tenants | 🧠 Opus | TLS SIP server | Only if a tenant runs Asterisk/Kamailio. Includes the Record-Route ACK fix. |
| 11 | `WAC-11-video-screenshare.md` | (Optional) Video / screen-share when Meta GA's them | ⚡ Sonnet | — | Extend the media bridge + live-call view. Ship when available. |

## Prereqs already satisfied by the base build (reuse — do NOT rebuild)
- **WhatsApp Cloud API + Graph client** — `apps/api/src/messaging/senders.ts` (`WhatsAppSender`).
- **Meta webhook receipt + HMAC (X-Hub-Signature-256)** — `apps/api/src/messaging/webhook-verify.ts` (`verifyMetaSignature`) + raw-body route in `main.ts`.
- **WebRTC/OPUS AI loop** — `apps/voice` (LiveKit/Pipecat, STT→LLM→TTS).
- **Telephony seam + adapters** — `packages/provider-router/src/adapters/{twilio,telnyx,plivo}.ts`.
- **Cost/wallet/UsageRecord + reseller margin** — `apps/api/src/{cost,wallet}`.
- **Number provisioning, agents, flows, memory, analytics, callbacks** — base build.

## Cross-cutting rules for EVERY WAC day (non-negotiable)
- **Provider-agnostic (golden rule #2):** every Meta/Graph-API/SDP specific lives ONLY in the `WhatsAppCallingTelephony` adapter (`packages/provider-router`) + the voice-service bridge. Never leak Graph API URLs into services/routes/UI.
- **Tenant-scoped (golden rule #1):** resolve tenant from `phone_number_id` on every webhook; every read/write via `db.withTenant` (RLS); new tables get `tenant_isolation` + the new-table checklist.
- **Metered (golden rule #4):** every call path writes a `UsageRecord` (inbound billable=0 but logged) + debits the wallet on outbound. No unmetered calling path.
- **Secrets (golden rule #5):** WABA token via BYOK/keypool, encrypted at rest, never logged; **verify X-Hub-Signature-256 on every webhook**; SDP/ICE from Meta is untrusted input; SSRF-safe media (only Meta's negotiated candidates).
- **Idempotent by WACID:** every call event de-duped on the WhatsApp call id (`wacid.…`).
- **Gated/demo when no WABA calling:** feature degrades to a Setup/Demo state + Live/Demo badge (same pattern as messaging + number-provisioning).
- **UI floor (every frontend day):** read `DESIGN-SYSTEM.md`; use `packages/ui` only (Card/Button/Switch/Tabs/SegmentedControl/Stepper/Toast/Callout/StatCard/Sparkline/Meter…), lucide icons, dark-first, tenant white-label tokens, `prefers-reduced-motion` fallbacks, a11y labels, loading/empty/error states. The **live-call view uses the signature waveform** (§5c).
- **Latency target:** WhatsApp AI calls must hit the same end-to-end target as PSTN/web (< ~800 ms turn) — co-locate media with STT/TTS.

## Admin decisions locked before WAC-01 (see plan Part L)
Same number vs dedicated · BYOK vs managed + minute markup · Tech-Partner sandbox vs test number · v1 inbound-only · media host (extend voice service) · Graph-API+WebRTC only (SIP = WAC-10 optional).

> Full spec, API reference, pricing, and rationale: `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md`.
