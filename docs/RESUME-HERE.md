# RESUME-HERE — session checkpoint (2026-08-07b)

> **Naye Claude session ke liye:** yahan se resume karo. Ye file har checkpoint pe update hoti hai.
> Detail inventory: `docs/PENDING-AUDIT.md` (definitive "what's left") + `docs/BUILD-LOG.md` (per-increment log).

## 📍 Current state

- **Branch/commit:** `main` @ `7f02883` — local (`/Users/saransh/Documents/VOCAL-IQ`), GitHub (`thequantcoder/VOCAL-IQ`), sab sync. Working tree clean. Koi open PR nahi.
- **Product:** feature-complete (Days 00–95 + UX + PARITY + WAC + MEC sab done). CI (node/voice/security) green on main.
- **⚑ ALL PURE-NO-KEYS PENDING WORK DONE.** Dashboard **Hindi l10n 100% complete** — har page + WhatsApp/Messenger calling cluster + **dono React-Flow visual builders** (agent flow #241/#242 + automation workflow #243). Plus **#244**: provider-router stale-comment fix + `apps/mobile` pure test harness (`lib/headers.ts` `buildHeaders` extract + ts-jest Node harness, 5/5 green, standalone/not-CI). Plus **#245**: `PROJECT-FEATURES-EXPLAINED.docx` regen. Ab jo bacha hai wo **keys** (go-live smokes), **partner/decision** (KMS/PCI/spam-label), ya **human professional translation** (9 non-Hindi India langs) maangta hai — pure-no-keys code kaam khatam.
- **2026-08-06/07 session (PRs #217–#245, sab merged):** dashboard l10n ka poora grind — ~76 pages + calling cluster + both builders Hindi (English-as-key + graceful fallback; ~1600+ `hi` keys in `apps/web/lib/i18n/catalogs.ts`); `apps/mobile` test harness + provider-router comment cleanup (#244); features `.docx` regen (#245).
- **2026-08-04/05 session (PRs #209–#216, sab merged):**
  - **#209 Voice transcript ingest** — voice `TranscriptReporter` → api `POST /internal/voice/transcript` (constant-time secret, **exact-ownership tenant guard**) → Transcript upsert → FORM extraction. Isse pehle production me Transcript rows koi banata hi nahi tha — poora post-call chain (intel/QA/search/FORM) voice pe dead tha.
  - **#210 Bridges wired** — WhatsApp + Messenger WebRTC bridges me bhi reporter (teeno voice paths ab report karte hain). Go-live: `API_INTERNAL_URL` (voice) + `VOICE_INTERNAL_SECRET` (dono taraf).
  - **#211 Nav l10n** — +9 India UI locales (bn/ta/te/mr/gu/kn/ml/pa/or); poori sidebar nav (~60 labels) 10 Indian languages me (English-as-key + per-key fallback).
  - **#213 WhatsApp WAC-08 latent-crash fix** — WA bridge me `offer()`/`apply_answer()` add (router call karta tha par methods missing the → AttributeError); ab Messenger ke saath symmetric + parity-guard test.
  - **#214–#215 Page-level l10n** — Overview, Agents, Calls pages ki strings `t()` me + full Hindi (regional English pe graceful fallback).
  - **#216 packages/ui first tests** — vitest harness + `charts/geometry.ts` ke 8 pure-math tests (lockfile regen `/tmp` mirror me — niche B.6 note).
  - (#212 = pichhla checkpoint refresh.)
- **Pichhla arc (PRs #193–#208):** India voice complete (Sarvam end-to-end + pickers + all-4-path plumbing), definitive pending audit (#197), P1 seams real (WorkOS SSO/Resend/HeyGen/PCI-receipts/fine-tune #198–#200), P2 (Qdrant #201, connectors #202–#203), in-call FORM node all-channels (#204–#207), checkpoint (#208).

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
3. **Dashboard localization (Hindi)** — ✅ **COMPLETE.** nav all-10 (#211) + EVERY page + full WhatsApp/Messenger calling cluster (landing/settings/sub-components/live pages) + **both React-Flow visual builders** (agent flow `components/builder/*` #241/#242 + automation workflow `components/workflow-builder/*` #243). Pattern (for future locales): wrap strings in `t()` (English-as-key) + add Hindi; regional falls back to English gracefully. **kitchen** page intentionally excluded (dev-only gallery). **Baaki l10n = regional professional translation** of the 9 non-Hindi India catalogs (bn/ta/te/mr/gu/kn/ml/pa/or) — HUMAN work, NOT machine-grind. **Gotchas (for the builders esp.):** (a) React-Flow callbacks/vars are `t`-heavy → rename EVERY `t`-shadow (`PALETTE.map((t))`→`nt`, `.map((t))`→`br/turn/at`, `nodes.find(...) t`→`trig`); (b) node-type meta labels from `Record<string,{label}>` → `t(META[key]?.label ?? key)` needs `?? key` guard (`noUncheckedIndexedAccess` → CI-only TS2345); (c) English-as-key can't hold two senses of one word — repeated label reuses ONE Hindi key (biome dup-flag; scan the `hi` block); (d) enum DATA values (call direction/channel, lead status/stage, campaign status, theme chips) + acronyms + pure-example placeholders stay English; (e) flaky billing.service deadlock (40P01) trips node CI ~1-in-2 — rerun the failed job, web l10n us se unrelated.
4. ~~Voice-loop transcript persist~~ ✅ **DONE (#209 + #210)** — `TranscriptReporter` (voice) → `POST /internal/voice/transcript` (api, internal-secret, exact-ownership tenant guard) → Transcript upsert + FORM extraction. **Teeno voice paths wired:** LiveKit (`run_agent`) + WhatsApp + Messenger bridges. Go-live: `API_INTERNAL_URL` (voice) + `VOICE_INTERNAL_SECRET` (dono taraf).
5. ~~WA bridge `offer()`/`apply_answer()` latent crash~~ ✅ **FIXED (#213)** — WA bridge ab Messenger ke saath symmetric (dono outbound signaling methods + parity-guard test). WAC-08 outbound ab config-flip pe kaam karega, code-gap nahi; live-verify still Meta-creds-gated.
6. Chhota (bacha hua): ~~`packages/ui` zero tests~~ ✅ DONE (#216). ~~`apps/mobile` tests~~ ✅ DONE (#244 — `lib/headers.ts` `buildHeaders` extract + ts-jest **Node-env** harness, 5/5 pure tests pinning the tenant-scoping header contract; jest-expo native preset avoid kiya — mobile workspace-excluded hai to ye standalone dev-run hai, CI me nahi). ~~`provider-router/src/index.ts` stale comment~~ ✅ DONE (#244 — adapters ab built hain, "not implemented stub" claim hata diya). ~~`PROJECT-FEATURES-EXPLAINED.docx` regen~~ ✅ DONE (#245 — python-docx/lxml ab available). **Ab pure-no-keys code kaam list empty hai.**

**Lockfile note:** ek naya devDep add karne pe (CI `--frozen-lockfile` use karta hai) `pnpm-lock.yaml` regen karo — iCloud pe pnpm wedge hota hai, isliye `/tmp/vociq-fresh` mirror me `pnpm install --lockfile-only` chalao (pnpm 10.33.0, `/Users/saransh/.local/bin/pnpm`), phir lockfile ko iCloud me wapas copy karo. `pnpm --filter <pkg> test` se `/tmp` me verify bhi ho jaata hai (toolchain wahan chalti hai).

### C. 🤝 Partner/decision-gated (code se nahi banta)
- PCI card-capture (PCI-DSS partner + SAQ-A decision) · Cloud KMS (`KMS_KEY_ID` adapter; self-host `VAULT_MASTER_KEY` kaam karta hai) · Spam-label/STIR-SHAKEN (`NUMBER_REPUTATION_API_KEY`).

### D. 🚫 Externally blocked (Meta)
- WAC-11/MEC-11 video/screen-share (Meta GA nahi hua; `*_VIDEO_GA=false`) · WAC-00/MEC-00 live spikes (Meta sandbox creds).

### E. 🧪 Test gaps
- Cost-attribution (rule #4) proof sirf live-keyed tests me (CI me skip) · Sarvam STT wire-format unverified. (~~`apps/mobile` + `packages/ui` zero tests~~ ✅ dono ab covered — #216, #244.)

## ▶️ Suggested next moves (jab wapas aao)
1. **Keys available?** → Section A se ek module uthao (suggestion: Stripe ya voice-AI keys → poora calling stack live; `API_INTERNAL_URL`+`VOICE_INTERNAL_SECRET` bhi set karo taaki transcripts + post-call chain live ho).
2. **No keys?** → Pure-no-keys code kaam **khatam** ho chuka hai. Bacha hua kaam sirf: (a) **regional professional translation** — 9 non-Hindi India catalogs (bn/ta/te/mr/gu/kn/ml/pa/or) me page-copy, human translator se (nav already done, English-as-key fallback active); (b) partner/decision-gated (Section C: KMS/PCI/spam-label); (c) Section A ke go-live smokes jab keys aayein. Agar l10n aur karna ho to regional catalogs `apps/web/lib/i18n/catalogs.ts` me add karo (catalog-only, koi component-edit nahi — fallback already wired).
3. Kisi bhi confusion pe: `docs/PENDING-AUDIT.md` + memory (`session-resume`, `pending-audit`, `icloud-git-write-hang`) padho.

⚠️ **iCloud `.git` eviction (2026-08-07 me hua):** `.git` swap ke turant baad iCloud ne freshly-copied `.git` ko EVICT kar diya (working tree intact, par `.git` gayab → "not a git repository"). **Fix:** `rm -rf .git; cp -R /tmp/vociq-fresh/.git .git` + config re-set. `/tmp/vociq-fresh` clone hamesha durable source of truth hai — reconcile ke baad `git log` verify zaroor karo.
