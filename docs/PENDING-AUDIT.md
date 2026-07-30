# VocalIQ — Definitive Pending Audit

> Generated 2026-07-28 by a 4-way parallel source sweep of `main` (code markers · gated features · docs/BUILD-LOG deferrals · test gaps). This is the single source of truth for "what's actually left." Findings cross-validated across all four sweeps.

## TL;DR

The **product is feature-complete**: every day-prompt (00–95), UX-Day (00–16), PARITY (01–11), and Messenger-Calling slice has a "done" entry; nothing planned was skipped. What remains falls into six buckets, in priority order:

1. **🔴 P1 — "Advertised but inert" seams (need CODE, not just a key).** ~8 `build*` factories return a Disabled/mock impl **even when the documented env key is set**. Setting the key does NOT make these work — the real adapter was never written. *Highest risk: they read as shipped but silently no-op.*
2. **🟠 P2 — Buildable code gaps (no key needed).** Real TODOs / throwing stubs that can be built today.
3. **🟡 P3 — Credential-gated go-live.** Real adapter exists and flips live the moment a key/secret is set — just needs credentials + ops.
4. **🔵 P4 — Content work.** Dashboard localization (translation catalogs), no code.
5. **⚪ P5 — Externally blocked / decisions / optional future work.** Meta GA, legality sign-offs, the optional PRI-Telephony package.
6. **🧪 P6 — Test/coverage gaps.** Cost-attribution proof is live-only; Sarvam STT wire format unverified; `apps/mobile` + `packages/ui` untested.

---

## 🔴 P1 — "Advertised but inert" seams (setting the key is NOT enough — real adapter missing)

These are the most important to know about: the DI factory inspects env but returns the Disabled/mock version regardless, so the feature never actually runs even when configured. Each needs a real adapter coded into the seam.

**✅ Resolved (real adapter now coded — flips live on the key):** **SSO/WorkOS** (`WorkOsSsoProvider`, PR #198), **Marketing email/Resend** (`ResendEmailSender`, #198), **Video avatars/HeyGen** (`heygenAvatarProvider`, #198), **Payment receipts** (`EmailReceiptSender` — emails via the Resend seam, #199), **Provider fine-tune/OpenAI** (`OpenAiFineTuneProvider` — uploads the consented training set + creates a job, #200; the seam + `customModelSchema` gained `trainingExamples`). Set the documented key(s) and these now hit the real provider.

Remaining P1 (still mock/Disabled even with the key set):

| Feature | File (factory) | What happens even when "configured" | To finish |
|---|---|---|---|
| **PCI pay-by-voice capture (Day 78)** | `apps/api/src/payments/payments.service.ts:59-61` | `buildPciCaptureProvider` ignores env, always Disabled → capture/charge/refund refuse. Card-detection + out-of-scope model built. | Code a PCI-DSS capture adapter (+ confirm PCI model, see P5). |
| **Cloud KMS envelope encryption (Day 57)** | `apps/api/src/crypto/envelope.ts` | `buildEncryptor` always returns `LocalMasterKeyProvider`; `KMS_KEY_ID` is referenced but never wired. `VAULT_MASTER_KEY` (local) works for self-host. | Code a cloud-KMS adapter behind `KMS_KEY_ID` (only needed for managed cloud). |
| **Caller reputation / spam-label lookup (Day 69)** | `apps/api/src/reputation/reputation.service.ts` | External spam-label provider defaults to `async () => null`; score/warm-up/auto-rest still work from self-signals; attestation defaults `'A'`. | Inject a real spam-label/STIR-SHAKEN provider (`NUMBER_REPUTATION_API_KEY`). |

---

## 🟠 P2 — Buildable code gaps (no external key required to write)

**✅ Resolved:** **Qdrant vector store** (`QdrantVectorStore` — real REST client, lazy Cosine collection + tenant-filtered search, #201); **non-HubSpot connectors** (`Webhook`/`Zapier`, `Zendesk`, `Salesforce` connectors + factory wiring, #202 — `GOOGLE` intentionally stays unbuilt: `CONNECTOR_META` gives it no contact-sync capability).

| Gap | File | Note |
|---|---|---|
| **Voice `/start` Call-row persistence** | `apps/voice/app/calls/router.py:61` | `TODO(Day 09 live)`: LiveKit path doesn't set tenant on the DB session / persist a `Call` row. |
| **Voice `POST /calls/dial` endpoint** | *(not present)* | The PSTN dial endpoint that the api's `HttpDialer` already POSTs to (with `language`+`voice_id`, #196) is **not built**. Partly needs a funded number to verify (P3), but the endpoint + Twilio↔LiveKit media bridge is code. |
| **Two worker outbound-dial seams** | `apps/workers/src/campaign-scheduler.ts:186`, `apps/workers/src/callback-dialer.ts:126` | `TODO(live)`: both mark the contact `CALLING`/`dialing` but never enqueue the real metered outbound call — need wiring through `OutboundService` (blocked on the `HttpDialer`→voice chain above). |
| **Stale doc comment** | `packages/provider-router/src/index.ts:130` | Says adapters "are stubs that throw not-implemented" — false; ElevenLabs/Deepgram/Twilio/LiveKit adapters are all built. Cleanup only. |
| **Live abandon-rate feed (Day 79)** | predictive-dialer scheduler | Abandon rate hardcoded `0` until a live dialing feed exists. |
| **Residual PARITY-03 in-call FORM node** | PARITY-INDEX #03 | Shared foundation (#204) + api wiring (#205) + web builder node (#206): authors place a FORM node on the canvas + pick a form; `chat.service` expands it at compile and saves a `FormSubmission` at conversation-end — live for web-chat + messaging. **Only remaining:** voice-loop submission-save (voice already runs the expanded ask/capture; needs to report captured vars at call-end). |

---

## 🟡 P3 — Credential-gated go-live (real adapter exists; flips live on the key)

These genuinely activate when the credential is set — no code needed. The single highest-leverage pair is **`VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET`**, which wires the live path for the PSTN dialer, widget dispatch, and WhatsApp/Messenger media at once (each then also needs the voice-AI keys / carrier).

| Capability | Env var(s) to set | Behaviour until then |
|---|---|---|
| **Stripe billing** (the cleanest key-flip) | `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`, publishable key) | Checkout throws "not configured"; usage aggregated locally; plans usable locally. |
| **Voice agent loop** (all channels) | `DEEPGRAM_API_KEY` + `OPENAI_API_KEY` + `ELEVENLABS_API_KEY` | Dispatch 503 "voice-ai providers not configured". |
| **LiveKit rooms/tokens** | `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` | Room ops degrade; no media. |
| **Live wiring seam** (dialer/widget/WA/ME media) | `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` | `Pending*` no-ops (call created but no agent joins/dials). |
| **India Sarvam stack** | `SARVAM_API_KEY` | Indic calls stay on the default Deepgram/OpenAI/ElevenLabs stack (FE + all seams already threaded). |
| **PSTN carrier / numbers** | `TWILIO_ACCOUNT_SID`+`TWILIO_AUTH_TOKEN` → else `TELNYX_API_KEY` → else `PLIVO_*` | Mock 555-01xx catalogue (`mock:true`); PSTN dial no-ops. |
| **SIP trunk** (Day 35) | real SIP trunk creds | Register/route/place gated voice-side. |
| **Google Calendar 2-way sync** (Day 36) | `GOOGLE_OAUTH_CLIENT_ID`+`SECRET` (Calendar scope) | `noopCalendarSync`; appointments CRUD works, no mirroring. |
| **Google Sheets sync** (Day 37) | `GOOGLE_OAUTH_*` (Sheets scope) | `noopSheetSink`; form→Contact/Lead works. |
| **Messaging channels** (Day 44/93) | per channel: `WHATSAPP_*` / `TWILIO_*`+`TWILIO_MESSAGING_FROM` / `TELEGRAM_BOT_TOKEN` / `MESSENGER_PAGE_ACCESS_TOKEN` / `INSTAGRAM_ACCESS_TOKEN` / `RCS_API_*` | Send persisted `QUEUED` + "No provider configured"; cost still metered. WhatsApp templates also need Meta approval. |
| **WhatsApp Calling** (WAC) | `WHATSAPP_ACCESS_TOKEN`+`WHATSAPP_PHONE_NUMBER_ID` + voice URL/secret + AI keys | Events recorded; no signaling/media. |
| **Messenger Calling** (MEC) | `MESSENGER_PAGE_ACCESS_TOKEN` + voice URL/secret + AI keys | Events recorded; call stays `connecting`. |
| **ElevenLabs voice cloning** (Day 26) | cloning-capable `ELEVENLABS_API_KEY` + consent | Fake cloner in CI; library/tuning work. |
| **Custom-domain SSL** (Day 52) | `CLOUDFLARE_SAAS_ZONE_ID` + `CLOUDFLARE_API_TOKEN` | Domain recorded at `pending`, no SSL. |
| **Speech-to-Speech** (Day 65) | S2S provider key/flag | Always resolves to STT→LLM→TTS pipeline. |
| **Scale backends** (Day 62) | `CLICKHOUSE_URL`, `QDRANT_URL`, `VOICE_REGIONS` | Single-region; in-memory vectors. |
| **Voice biometrics vendor** (Day 91) | `VOICE_BIOMETRICS_API_KEY` (+ legality, P5) | Deterministic self-host provider (synthetic liveness). |
| **Observability** | `SENTRY_DSN`, `POSTHOG_KEY` | No error/product telemetry. |
| **Prod secrets** | `VAULT_MASTER_KEY`, `APP_JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `DATA_REGION`, `BACKUPS_VERIFIED=true` | Launch-readiness gate (`apps/api/src/launch/launch.service.ts`) reports these. |

---

## 🔵 P4 — Content work (no code, no keys)

- **Dashboard UI localization** into the 22 Indian languages (+ Day-68 locales). Only the `hi` scaffold exists in `i18n.ts`. This is per-locale translation **catalog** content.

---

## ⚪ P5 — Externally blocked / decisions / optional future

**Externally blocked (cannot build until a third party acts):**
- **WAC-00** live WhatsApp media spike — needs Meta Tech-Partner sandbox creds + a public tunnel.
- **MEC-00** Messenger wire-format spike — Meta hasn't published the low-level wire format + needs Page allow-list (not buildable yet).
- **WAC-11 / MEC-11 video/screen-share** — Meta hasn't GA'd it; honest gated seam shipped (compile-time `WHATSAPP_VIDEO_GA` / `MESSENGER_VIDEO_GA = false`, every call forced audio-only). Flip the constant + implement `m=video` negotiation when Meta GAs.

**Decisions / admin sign-offs required:**
- PCI responsibility model (built to SAQ-A out-of-scope default) before live card charges (Day 78).
- WhatsApp Calling open decisions (same-WABA-vs-dedicated number, BYOK-vs-managed + minute markup, media-host, SIP-mode need) — plan §L.
- Messenger Calling open decisions (inbound-first scope, calling token/allow-list, pricing) — plan §I.
- Voice-biometrics regional legality + consent (Day 91); avatar likeness consent (Day 92).

**Optional future package (fully planned, not started — by design post-Day-94):**
- **PRI Telephony integration** — 10 work packages (WP1–WP10) in `PRI-TELEPHONY-INTEGRATION-PLAN.md`, gated behind `PlanFeature.PRI_TELEPHONY`.

**Verified — nothing unbuilt here:** **WAC-09** (least-cost routing / restriction guardrails) IS built (`apps/api/src/whatsapp-calling/whatsapp-routing.service.ts` + test) — it just lacks a dedicated BUILD-LOG "done" line. (WAC-10/11 and MEC-09/10/11 are explicitly optional or N/A by design.) So **no planned prompt across Days 00–95 / UX / PARITY / WAC / MEC is a genuine gap.**

---

## 🧪 P6 — Test / coverage gaps

- **Cost-attribution (golden rule #4) is proven only live:** `apps/api/src/router/router.service.live.test.ts` + `packages/provider-router/src/live.test.ts` (`describe.skip` unless LLM keys) are the only tests that a real completion persists a tenant-scoped `UsageRecord` — never run in CI.
- **Sarvam Indic STT wire format is a documented guess:** `apps/voice/app/providers/adapters/sarvam_stt.py:9-12` carries a `[CONFIRM live @ SARVAM_API_KEY]` note; no test covers the WS frame encoding. India STT unproven end-to-end.
- **Real WebRTC media paths (LiveKit / WA / ME bridges) proven only in opt-in live checks** (`test_livekit_call_live.py`, `test_livekit.py`, WA/ME control tests use a fake bridge). The bridge code is real aiortc, just not CI-exercised.
- **Zero tests:** `apps/mobile` (thin Expo scaffold) and `packages/ui` (component library).
- No `.only`/`xit`/`xfail` focus tests hiding siblings — clean. All skips are env-conditional live guards.

---

## Highest-leverage next moves

- **Cheapest "make it real" wins (P1, code-only, no external dep):** write the `WorkOsSsoProvider`, `ResendEmailSender`, and swap `mockAvatarProvider` for a real vendor — these are the three "advertised but inert" features most likely to surprise a buyer/demo.
- **Biggest go-live unlock (P3):** set `VOICE_SERVICE_URL`+`VOICE_INTERNAL_SECRET` + the 3 voice-AI keys + `LIVEKIT_*` → the entire voice calling path (widget/WA/Messenger, and PSTN once its endpoint + a funded number land) comes alive. Add `SARVAM_API_KEY` for India.
- **Cleanest single key flip:** `STRIPE_SECRET_KEY` → billing goes fully live (real adapter already coded).
- **Pure product content:** dashboard localization (P4).
