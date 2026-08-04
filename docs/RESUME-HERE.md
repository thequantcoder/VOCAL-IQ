# RESUME-HERE — session checkpoint (2026-07-30)

> **Naye Claude session ke liye:** yahan se resume karo. Ye file har checkpoint pe update hoti hai.
> Detail inventory: `docs/PENDING-AUDIT.md` (definitive "what's left") + `docs/BUILD-LOG.md` (per-increment log).

## 📍 Current state

- **Branch/commit:** `main` @ `11eff6a` — local (`/Users/saransh/Documents/VOCAL-IQ`), GitHub (`thequantcoder/VOCAL-IQ`), sab sync. Working tree clean.
- **Product:** feature-complete (Days 00–95 + UX + PARITY + WAC + MEC sab done). CI (node/voice/security) green on main.
- **Last arc (PRs #193–#207, sab merged):**
  - India voice COMPLETE: Sarvam backend (#190–192) + language picker (#193) + Bulbul voice-picker (#194) + WA/Messenger plumbing (#195) + PSTN API-side (#196). Gated on `SARVAM_API_KEY`.
  - Definitive pending audit (#197) → `docs/PENDING-AUDIT.md`.
  - P1 "advertised-but-inert" seams ab REAL: WorkOS SSO + Resend email + HeyGen avatar (#198), PCI receipts (#199), OpenAI fine-tune (#200).
  - P2: Qdrant vector store (#201), Salesforce/Zendesk/Webhook/Zapier connectors (#202) + connect-form settings UI (#203).
  - In-call FORM node COMPLETE all channels: shared expansion (#204) + api wiring (#205) + builder UI (#206) + voice leg (ask-brief + post-call metered extraction, #207).

## ⚠️ Is repo me kaam karne ka tarika (zaroori — warna time barbaad hoga)

1. **iCloud git-write hang:** repo iCloud-synced folder me hai — `git commit/fetch/status` yahan HANG hote hain. **Workflow:** `git clone https://github.com/thequantcoder/VOCAL-IQ /tmp/vociq-fresh` → changed files iCloud tree se `/tmp` me `cp` → wahan branch+commit+push+`gh pr create` → CI green → squash-merge → merged main ka `.git` wapas iCloud repo me swap (`mv .git aside; cp -R /tmp/vociq-fresh/.git .git`). Edits hamesha canonical iCloud tree me karo; commits `/tmp` se.
2. **Local test/typecheck bhi wedge hote hain** (vitest/pytest/pnpm iCloud pe) — **CI is the gate.** Biome ko file-scoped chalao (`npx biome check <files>` — full-repo 20-diagnostic cap me real error chhup jaata hai).
3. **`exactOptionalPropertyTypes` on hai:** `x?: T` field ko maybe-undefined value do to `x?: T | undefined` likho — warna CI typecheck fail.
4. Prisma enum migrations hand-clean likho (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`); `migrate dev` drift bundle karta hai.

## 📋 Pending — kya build/test karna hai

### A. 🔑 Sirf keys/credentials chahiye (code built + gated; key milte hi live + smoke-test karna)
| Module | Env/needs |
|---|---|
| Stripe billing (cleanest flip) | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Voice AI loop (sab channels) | `DEEPGRAM_API_KEY` + `OPENAI_API_KEY` + `ELEVENLABS_API_KEY` + `LIVEKIT_*` |
| Live wiring seam (dialer/widget/WA/ME media) | `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` |
| India/Sarvam live verify (+ STT frame-encoding `[CONFIRM live]`) | `SARVAM_API_KEY` |
| Twilio PSTN (numbers + outbound) | Twilio creds + funded number + tunnel |
| SIP trunk | real trunk creds |
| Google Calendar / Sheets sync | `GOOGLE_OAUTH_CLIENT_ID/SECRET` |
| WhatsApp/Messenger calling live media | Meta creds + voice URL/secret |
| Messaging channels (Telegram/IG/RCS/SMS) | per-channel keys |
| Custom domains SSL | `CLOUDFLARE_SAAS_ZONE_ID` + `CLOUDFLARE_API_TOKEN` |
| WorkOS SSO / Resend email / HeyGen avatar / OpenAI fine-tune / Qdrant — **naye adapters (#198–#201) ka live smoke-test** | respective keys |
| Voice biometrics / S2S / Sentry / PostHog | respective keys |

### B. 🛠️ Buildable (no keys) — agla code kaam
1. **Voice `POST /calls/dial`** endpoint + Twilio↔LiveKit bridge (api side ready — `HttpDialer` language+voice_id bhejta hai). Twilio go-live ke saath.
2. **Worker dial seams** (`campaign-scheduler`, `callback-dialer`) — `OutboundService` se wire (cross-app; direct Prisma se DNC/consent gates bypass honge — mat karna).
3. **Dashboard localization** — 22 Indian languages + Day-68 locales (translation content; sirf `hi` scaffold hai).
4. ~~Voice-loop transcript persist~~ ✅ **DONE (#209 + #210)** — `TranscriptReporter` (voice) → `POST /internal/voice/transcript` (api, internal-secret, exact-ownership tenant guard) → Transcript upsert + FORM extraction. **Teeno voice paths wired:** LiveKit (`run_agent`) + WhatsApp + Messenger bridges. Go-live: `API_INTERNAL_URL` (voice) + `VOICE_INTERNAL_SECRET` (dono taraf). ⚠️ Latent (WAC-08 live leg): WA bridge me `offer()`/`apply_answer()` methods nahi hain par router unhe call karta hai — Meta-creds go-live pe banana.
5. Chhota: `provider-router/src/index.ts:130` stale comment cleanup; `PROJECT-FEATURES-EXPLAINED.docx` regen (lxml sandbox me atka tha; `.md` current hai).

### C. 🤝 Partner/decision-gated (code se nahi banta)
- PCI card-capture (PCI-DSS partner + SAQ-A decision) · Cloud KMS (`KMS_KEY_ID` adapter; self-host `VAULT_MASTER_KEY` kaam karta hai) · Spam-label/STIR-SHAKEN (`NUMBER_REPUTATION_API_KEY`).

### D. 🚫 Externally blocked (Meta)
- WAC-11/MEC-11 video/screen-share (Meta GA nahi hua; `*_VIDEO_GA=false`) · WAC-00/MEC-00 live spikes (Meta sandbox creds).

### E. 🧪 Test gaps
- Cost-attribution (rule #4) proof sirf live-keyed tests me (CI me skip) · `apps/mobile` + `packages/ui` zero tests · Sarvam STT wire-format unverified.

## ▶️ Suggested next moves (jab wapas aao)
1. **Keys available?** → Section A se ek module uthao (suggestion: Stripe ya voice-AI keys → poora calling stack live).
2. **No keys?** → Section B: dashboard localization (Hindi content) YA voice-loop transcript persist (FORM/intel ko widget pe live karta hai).
3. Kisi bhi confusion pe: `docs/PENDING-AUDIT.md` + memory (`pending-audit`, `icloud-git-write-hang`) padho.
