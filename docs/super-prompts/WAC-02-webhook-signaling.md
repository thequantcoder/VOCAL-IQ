# WAC 02 — Meta `calls` webhook + call-signaling service  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- App subscribed to the WABA + the **`calls`** webhook field; the public webhook URL registered in the Meta app; `META_APP_SECRET` + `META_WEBHOOK_VERIFY_TOKEN` set. (Reuse the existing messaging webhook subscription.)

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.3 (Connect/Terminate payloads), §A.4 (outbound Status webhooks), §A.5 (`call_permission_reply`), §A.6 (`account_settings_update`, restrictions), §C.2/C.3 items 2**. + WAC-00 findings.
- `apps/api/src/messaging/webhook-verify.ts` (`verifyMetaSignature`) + `apps/api/src/main.ts` (raw-body Meta webhook handlers) — **extend, don't fork**.
- WAC-01 adapter (`WhatsAppCallingTelephony`) — the service calls this, never Graph directly.
- `apps/api/src/composition.ts` (wire the new service), `apps/api/src/db/prisma.service.ts` (`withTenant`).

## Objective
Receive Meta's calling webhooks on the **existing HMAC-verified raw-body seam**, resolve the **tenant from `phone_number_id`**, and drive the inbound signaling handshake (pre_accept → accept / reject / terminate) via the WAC-01 adapter — **idempotent by WACID**, tenant-scoped (RLS), fully logged as call lifecycle. No media here (WAC-03 owns media); this is the control plane.

## Step-by-step build
1. **DB (additive migration, `packages/db`)** — extend `Call` with `channel="WHATSAPP"`, `waCallId` (unique per tenant), `direction` (`USER_INITIATED|BUSINESS_INITIATED`), `ctaPayload?`, `deeplinkPayload?`, `waStatus?`, `permissionStatus?`, `startedAt?/endedAt?/durationSeconds?`. Add a `WhatsAppCallEvent` audit table (tenantId, waCallId, event, payload, ts) for replay/debug. RLS `tenant_isolation` on any new table (new-table checklist).
2. **Webhook routing** — in the existing Meta webhook handler, branch on `changes[].field === "calls"` and `statuses[].type === "call"` and `interactive.type === "call_permission_reply"` and `field === "account_settings_update"`/`account_update`. **Reuse `verifyMetaSignature`** (fail-closed on bad HMAC). Resolve tenant by `metadata.phone_number_id → tenant` (the messaging pattern). De-dupe by WACID (ignore repeats).
3. **`WhatsAppCallingService`** (`apps/api/src/whatsapp-calling/whatsapp-calling.service.ts`), tenant-scoped via `withTenant`:
   - `onConnect(tenantId, payload)` — inbound: create/lookup the `Call` (channel=WHATSAPP, direction=USER_INITIATED, ctaPayload/deeplinkPayload captured), hand the caller SDP offer to the **media bridge control channel** (stub in this day → returns a fixed/placeholder answer so the handshake is testable; real answer arrives in WAC-03), then call adapter `preAccept` → `accept`. Enforce the **30–60 s window** (fast path).
   - `onStatus(...)` (outbound RINGING/ACCEPTED/REJECTED), `onTerminate(...)` (persist status/duration/errors, close the call, mark for cost in WAC-06), `onPermissionReply(...)`, `onSettingsUpdate(...)`/`onRestriction(...)` (persist + raise an alert/notification).
   - `reject(tenantId, callId)` / `terminate(tenantId, callId)` passthroughs.
4. **Control-channel contract** to the voice service — define the small typed interface (`requestSdpAnswer(callId, sdpOffer) → sdpAnswer`, `endCall(callId)`) injected into the service so WAC-03 can implement it; a fake in tests. Keep the api ↔ voice hop inside the accept window.
5. **Composition + routes** — construct the service in `composition.ts` (inject the adapter + control channel + prisma); mount any admin/read routes under a `whatsapp-calling` surface (list WhatsApp calls, replay events) — reads any member, mutations config-writers.
6. **Tests** (real-DB, RLS): Connect webhook (with a valid HMAC) creates a tenant-scoped Call + drives preAccept/accept via a fake adapter; bad HMAC → 401/ignored; unknown `phone_number_id` → no cross-tenant write; duplicate WACID → single Call (idempotent); Terminate persists status+duration; permission-reply + restriction events persisted; tenant B never sees tenant A's WhatsApp calls.

## Definition of Done
- [ ] Meta `calls`/status/permission/settings webhooks are received on the existing HMAC-verified seam, tenant-resolved by `phone_number_id`, idempotent by WACID.
- [ ] Inbound Connect drives `preAccept`→`accept` via the adapter within the accept window (media answer stubbed via the control-channel contract).
- [ ] Call lifecycle (status, duration, errors, payloads, restrictions) persisted, tenant-scoped (RLS), audited.
- [ ] Tests pass (incl. HMAC fail-closed + isolation + idempotency).

## Self-audit focus
Full A–K. Special attention: **C (HMAC verified, fail-closed; no token/SDP logged), B (tenant resolved from `phone_number_id`; RLS on new tables; no cross-tenant write), A (idempotent by WACID; accept-window timing), E (every Meta error/restriction captured, never crashes the webhook).**

## Commit plan
`feat(api,db): WhatsApp calls webhook + signaling service [wac-02]` — branch `wac/02-webhook-signaling` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
WhatsApp call control plane live (signaling + lifecycle + isolation). Media answer is stubbed. Next: WAC-03 — the real WebRTC media bridge in the voice service.
