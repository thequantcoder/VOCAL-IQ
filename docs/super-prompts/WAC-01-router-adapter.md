# WAC 01 — `WhatsAppCallingTelephony` provider-router adapter + pricing  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- None (uses the existing WABA/token from messaging; real calls happen from WAC-02 onward). Confirm **BYOK vs managed** decision (plan Part L) so key resolution is right.

> If a decision above is missing, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.3/A.4 (all `/calls` endpoints + bodies), §A.5 (`/call_permissions`), §A.6 (`/settings`), §A.9 (pricing), §C.3 item 1**. Plus the WAC-00 findings note.
- `packages/provider-router/src/adapters/telnyx.ts` + `plivo.ts` — the **exact adapter pattern to mirror** (a 2nd/3rd carrier landed this way in PARITY-01).
- `packages/provider-router/src/index.ts` (Telephony/media contracts), `pricing.ts`, `router.ts`.
- `apps/api/src/messaging/senders.ts` (`WhatsAppSender`) — reuse its Graph client shape (base URL, auth header, error handling).

## Objective
Add **WhatsApp Calling behind the provider-router seam** exactly like Twilio/Telnyx/Plivo, so all Meta/Graph-API specifics live in ONE file (golden rule #2). Pure, HTTP-injected, offline-unit-tested. Adding WhatsApp as a carrier is a config change everywhere else.

## Step-by-step build
1. **Adapter** `packages/provider-router/src/adapters/whatsapp-calling.ts` — `WhatsAppCallingTelephony` implementing the telephony contract + a WhatsApp-specific extension for signaling. HTTP injected (fake transport in tests). Methods, each mapping to a Graph call and returning a typed result:
   - `placeCall({ to|recipient, sdpOffer, callbackData? })` → `POST /<PNID>/calls action=connect` → `{ waCallId }`.
   - `preAccept({ callId, sdpAnswer })` / `accept({ callId, sdpAnswer, callbackData? })` / `reject({ callId })` / `terminate({ callId })` → `POST /<PNID>/calls`.
   - `sendCallPermissionRequest({ to|recipient, text?, templateName? })` → `POST /<PNID>/messages` (interactive `call_permission_request` or template).
   - `getCallPermission({ userWaId|recipient })` → `GET /<PNID>/call_permissions` → `{ status, expirationTime?, actions[] }`.
   - `getSettings()` / `updateSettings(calling)` → `GET|POST /<PNID>/settings`.
   - Pin the Graph API version (constant); typed error mapping (esp. **`138006` = no permission**); never log tokens/SDP.
2. **Pricing** — extend `packages/provider-router/src/pricing.ts` with a `whatsapp_calling` price source: **inbound = 0**; **outbound = per-destination-country, per-minute, billed in 6-second pulses (round up), only when answered**, monthly volume-tiered. Model it as a lookup `(countryCode, monthlyMinutesTier) → perMinuteCents`, seeded with a small starter rate card (USD) + a clearly-marked TODO to load Meta's full quarterly rate card. Export a pure `whatsappCallCostCents(durationSeconds, countryCode, tier)`.
3. **Router registration** — register the adapter under a `whatsapp` telephony provider id so the router (and later least-cost routing, WAC-09) can select it; every place a call is charged emits a `UsageRecord` (do this in the consuming service, not the adapter, but expose the cost helper here).
4. **Provider-router index exports** — export `WhatsAppCallingTelephony` (mirror the Telnyx/Plivo export lines).
5. **Tests** (`whatsapp-calling.test.ts`, offline, fake HTTP): request bodies for connect/pre_accept/accept/reject/terminate are exactly right (action, session shape); permission-request + get-permission parsing; `138006` maps to a typed "needs permission" error; **pricing math** — 56 s → 10 pulses, inbound → 0, tier boundary uses the lower rate; **no token/SDP ever appears in a thrown error or log**.

## Definition of Done
- [ ] `WhatsAppCallingTelephony` implements every `/calls`, `/messages` (permission), `/call_permissions`, `/settings` call with correct bodies; offline-tested; typed errors.
- [ ] `whatsappCallCostCents` correct (6-s pulses, inbound=0, tiers) + unit-tested.
- [ ] All Meta/Graph specifics are inside this adapter only (no leakage). Exported from the router index.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Self-audit focus
Full A–K. Special attention: **B/C (no token/SDP in logs or errors; secrets stay in the key layer), D (pricing exactness — no unmetered path), I (nothing vendor-specific leaked outside the adapter — grep for `graph.facebook` outside this file).**

## Commit plan
`feat(provider-router): WhatsAppCallingTelephony adapter + calling pricing [wac-01]` — branch `wac/01-router-adapter` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
WhatsApp Calling is a router-level carrier now (config, not code, to use). Next: WAC-02 — wire the Meta `calls` webhook + signaling service.
