# WAC 08 — Permissions engine + consented outbound calling + permission inspector UI  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> ⚖️ **The compliance-heavy day.** Outbound WhatsApp calling is powerful but tightly governed — permissions expire silently, limits are strict, 4 unanswered auto-revokes, and 5 business-number countries are blocked. Get this wrong and you trip `RESTRICTED_*`. Design the guardrails IN.

## Prerequisites (admin)
- WAC-04..07 merged. A **payment method** on the WABA (outbound is billed). Business number **not** in US/CA/EG/VN/NG (else outbound is blocked — surface clearly).

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.4 (outbound `action=connect` + SDP offer + Status webhooks), §A.5 (permission states/limits/`GET /call_permissions`/`call_permission_reply`/auto-revoke), §A.6 (`callback_permission_status`), §A.11 (country block + restrictions), §D.4 (permission+callback automation), §E (weak/avoid: no cold mass outbound)**.
- WAC-01 adapter (`placeCall`, `sendCallPermissionRequest`, `getCallPermission`), WAC-02 service (`onStatus`, `onPermissionReply`), WAC-03 bridge (outbound: business generates the SDP offer), WAC-06 wallet (`chargeCall`).
- `apps/api/src/callbacks` (schedule callbacks), `apps/api/src/campaigns` (guardrails), the `contacts`/`leads` models.

## Objective
Enable **consented** business→user WhatsApp calls the AI agent can place — with a **permission engine** that tracks temporary-permission expiry (no expiry webhook exists), enforces every limit **before** dialing, avoids the 4-unanswered auto-revoke, respects country blocks, and never behaves like a cold dialer. Plus a clear **permission inspector** UI.

## Step-by-step build

### Backend
1. **Permission model + engine** — `WhatsAppCallPermission` (tenantId, contact/wa_id, status `no_permission|temporary|permanent`, `expiresAt?`, source `request|callback|profile`, updatedAt). RLS. A `WhatsAppPermissionService`:
   - `requestPermission(tenantId, contact, {text|template})` — send via the adapter; enforce the **1/24h, 2/7d** send caps first (check `GET /call_permissions.actions[]`).
   - `onPermissionReply(...)` — persist accept/reject, `is_permanent`, `expiration_timestamp` (from WAC-02); **temporary → start a local expiry timer** (since no expiry webhook), and re-check on read.
   - `canCall(tenantId, contact)` — the pre-dial gate: not `no_permission`, not expired, under the **≤100 connected/24h** cap, business number country allowed, and consecutive-unanswered count safe. Return a typed reason when blocked.
   - Track `consecutiveUnanswered` per pair from Status/Terminate; back off at 2 (nudge risk) and hard-stop before 4 (auto-revoke).
2. **Outbound dialing** — `WhatsAppCallingService.placeCall(tenantId, contact, agentId)`: gate via `canCall`; ask the WAC-03 bridge to generate a **business SDP offer**; adapter `placeCall(action=connect)` → get WACID → apply the SDP **answer** from the Connect webhook to the bridge → Status RINGING/ACCEPTED/REJECTED → media → Terminate → **meter via `chargeCall`** (WAC-06). Handle `138006` (no permission) → auto-fall-back to a permission request or PSTN (WAC-09).
3. **Callback automation** — set `callback_permission_status=ENABLED` (via WAC-05 settings) so a user who calls you auto-grants temporary permission; wire the WAC-04 "deflect/callback" path to capture callback intent → schedule a consented outbound (reuse `callbacks`).
4. **Anti-abuse** — hard guards: no bulk/cold outbound (block campaign-style WhatsApp outbound without per-contact permission), respect DNC, per-tenant rate limits, and the country block.
5. **Routes** — `POST /whatsapp-calling/permission-requests`, `GET /whatsapp-calling/permissions?contact=…`, `POST /whatsapp-calling/calls` (place) — config-writers, tenant-scoped.

### Frontend
6. **Permission inspector** — on a contact/lead, a WhatsApp-calling card: current permission (`Badge`: none/temporary(expires in Xd)/permanent), the send-caps remaining (from `getCallPermission.actions[].limits`), a "Request permission" action (interactive/template), and a "Call now" button **enabled only when `canCall` is true** (with the blocked reason shown otherwise). Reduced-motion-safe, a11y, loading/empty/error.
7. **Outbound in the live-call view** — reuse WAC-04's live-call view for outbound (direction badge + RINGING/ACCEPTED states before the waveform).

### Tests
8. Send-cap enforcement (1/24h, 2/7d) before request; expiry timer flips temporary→no_permission (no webhook); `canCall` blocks on expired/over-cap/blocked-country/near-auto-revoke with the right reason; consecutive-unanswered back-off; `138006` fallback; outbound places → meters via `chargeCall` once; no bulk/cold path; tenant-scoped. Web: inspector states, "Call now" gating, request flow.

## Definition of Done
- [ ] The AI agent can place **consented** outbound WhatsApp calls; every limit (permission, expiry, ≤100/day, sends 1/24h-2/7d, country block, unanswered back-off) is enforced **before** dialing.
- [ ] Temporary-permission expiry is tracked locally (no webhook); callback-permission auto-grant + callback scheduling work; no cold/bulk outbound is possible.
- [ ] Outbound is metered via `chargeCall`; permission inspector UI is clear + gates "Call now".
- [ ] Tests pass; typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **C/G (consent + every limit enforced pre-dial; no cold/bulk; DNC; country block — anti-abuse is the point), A (expiry timer correctness; unanswered back-off; `138006` handling), D (outbound metered once, never double), B (tenant/contact scope).**

## Commit plan
`feat(api,web,db): WhatsApp consented outbound + permission engine [wac-08]` — branch `wac/08-permissions-outbound` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
Consented outbound WhatsApp calling is live, fully guard-railed. Next: WAC-09 — least-cost routing + restriction guardrails.
