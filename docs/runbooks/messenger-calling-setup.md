# Messenger (Meta) Calling — Setup & Go-Live Runbook (MEC-00)

> **Purpose.** The VocalIQ Messenger Calling module (MEC-01 → MEC-07 + MEC-05) is **built and merged**, but every live path is **gated** — it only activates once (a) the Meta access below is granted and (b) the **MEC-00 wire-format confirmation** is done. This runbook is the admin's checklist to obtain that access, plus the exact list of API facts to confirm and where each plugs into the code. Nothing here guesses Meta's API (CLAUDE.md §15); the unconfirmed bits are called out and mapped to the `[CONFIRM @ MEC-00]` markers in the source.

---

## 0. TL;DR

1. Have a **Meta app** + a **Facebook Page** (the business identity) connected to it, with the **Messenger** product added.
2. Get **Advanced Access** to `pages_messaging` (App Review) and get the **Messenger Calling API enabled/allow-listed** for the app/Page (it is limited-access).
3. Subscribe the Page's webhook to the **call event field(s)** + **`call_settings`**.
4. Set the three env vars (same ones Day-93 Messenger messaging already uses).
5. Do the **MEC-00 confirmation** (§4) on a test call, un-`[CONFIRM]` the code, flip the module live.

---

## 1. What you're enabling (and why it's gated)

Messenger Calling = **WebRTC voice calls between a Facebook Page and a Messenger user (PSID)**, over the same Page + Graph API + webhooks that VocalIQ's Messenger *messaging* already uses. The code path is complete:

- inbound webhook → `MessengerCallingService.onConnect` → route to a PUBLISHED agent → SDP answer from the voice WebRTC bridge → `accept` via the provider adapter → unified `Call(channel=MESSENGER)` → cost metered on terminate → dashboard + live-call view.

It stays inert until creds exist because: the adapter resolver returns `null` with no `MESSENGER_PAGE_ACCESS_TOKEN`; the media control returns gated (`PendingMeMediaControl`) with no `VOICE_SERVICE_URL`/`VOICE_INTERNAL_SECRET`; and the webhook 503s with no `MESSENGER_APP_SECRET`.

---

## 2. Meta access — step by step

> Do these at **developers.facebook.com** (Meta for Developers) with a Business admin account. Some steps (Calling allow-list, App Review) involve Meta approval and can take days — start early.

**a. App + Page.** Create/choose a Meta **app** (type: Business). Create/choose the **Facebook Page** that is your brand's calling identity. Make sure the Page is owned by your Business and linked to the app.

**b. Add the Messenger product.** In the app dashboard → *Add product* → **Messenger** (this is the "Messenger Platform"). Under Messenger settings, connect the Page.

**c. Page access token.** In Messenger → Settings → *Access Tokens*, generate a **Page access token** for the Page. This is `MESSENGER_PAGE_ACCESS_TOKEN`. (For production, use a long-lived / system-user token, not a short-lived one.)

**d. `pages_messaging` — Advanced Access (App Review).** Standard Access only works for app admins/testers; to serve real users you need **Advanced Access** to `pages_messaging` via **App Review** (with the required business verification + use-case screencast). Until then, test with **app roles** (admin/developer/tester) whose own Messenger accounts can call the Page.

**e. Enable the Messenger Calling API (limited access).** Programmatic Messenger calling is **not on by default** — it is limited-access. In the app's Messenger settings look for a **Calling** capability / *Request access*, or request it through your Meta partner/rep. **[CONFIRM]** the exact enablement surface — it may be an allow-list request rather than a self-serve toggle.

**f. Webhook subscription.** Point the Page's Messenger webhook at VocalIQ's per-tenant URL:
```
https://<your-api-host>/public/messaging/messenger/<tenantId>
```
Set the **Verify Token** to `MESSENGER_VERIFY_TOKEN` and use the app's **App Secret** as `MESSENGER_APP_SECRET` (X-Hub-Signature-256). Subscribe the Page to the **call event field(s)** and **`call_settings`**. **[CONFIRM @ MEC-00]** the exact webhook field name(s) for calls (Messenger events arrive under `entry[].messaging[]`; the dispatcher already reads a `messaging[].call` shape + a WhatsApp-style `changes[].value.calls[]` fallback — see `apps/api/src/messenger-calling/messenger-calling.webhooks.ts`).

---

## 3. Environment variables

These are the **same creds Day-93 Messenger messaging uses** — one Page/app does messaging *and* calling. Set once in the root `.env` (never committed):

| Env var | What | Where used |
|---|---|---|
| `MESSENGER_PAGE_ACCESS_TOKEN` | Page access token (Bearer) | adapter resolver (`composition.ts`), messaging sender |
| `MESSENGER_APP_SECRET` | App Secret — HMAC-verifies the webhook | messenger webhook handler |
| `MESSENGER_VERIFY_TOKEN` | Webhook GET-challenge verify token | messenger webhook handler |
| `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` | api↔voice WebRTC bridge (already used by WhatsApp Calling) | `HttpMeMediaControl`, voice `/calls/messenger/*` |
| `MESSENGER_GRAPH_VERSION` (optional) | Graph API version override (default `v21.0`) | `MessengerCallingTelephony` |

> **Confirm at MEC-00:** whether the Day-93 Messenger creds suffice for *calling*, or Meta issues a separate calling token / requires a distinct webhook field. If separate, only `apps/api/src/composition.ts` (`meCallingAdapterFor`) needs the new source.

---

## 4. MEC-00 confirmation checklist (do this on a real test call)

Once access is granted, make one inbound test call from a Messenger user to the Page and capture the raw traffic. Confirm each fact and update the ONE marked location — nothing else changes:

| # | Confirm | Marked in | If different, change |
|---|---|---|---|
| 1 | Webhook **call event** field name + JSON shape (connect/terminate, `direction`, `session.sdp`, `ref`, duration, error) | `messenger-calling.webhooks.ts` (`MeCallEvent`, `dispatchMessengerCallingWebhook`) | the dispatcher's field extraction only |
| 2 | **Endpoint** paths for accept/pre_accept/reject/terminate + the request body (`recipient`, `action`, `session`) | `packages/provider-router/src/adapters/messenger-calling.ts` (`/me/calls`, `callAction`) | the adapter only |
| 3 | **SDP** exchange specifics (OPUS? codecs, ICE trickle vs non-trickle) | `apps/voice/app/telephony/messenger_webrtc.py` | the bridge only (mirrors WhatsApp today) |
| 4 | The **entry-point `ref`** field name + charset it echoes back | `messenger-call-link.ts` (`toMessengerCallRef`, base64url) | already charset-safe; confirm the field name |
| 5 | **Call settings** Graph shape (call-icon visibility, call hours) | `messenger-call-settings.ts` (`toGraphMessengerCalling`) | the mapper only |
| 6 | **Pricing** — is Messenger calling billed? (assumed free-tier $0 today) | `packages/provider-router/src/pricing.ts` (`MESSENGER_CALL_RATE_PER_MIN`) | the rate table only |
| 7 | **Permission caps** for *outbound* (Page-initiated) — window, rate limits | (MEC-08, not yet built) | the future `messenger-permission` governor |

Record the findings in a `docs/runbooks/messenger-calling-spike-findings.md` (mirror the WhatsApp `whatsapp-calling-spike-findings.md`).

---

## 5. After MEC-00 → what unblocks

- **Live inbound media** — flip on once §2 + §3 are set and §4 items 1–3 confirmed.
- **MEC-08 (outbound + permissions)** — the voice bridge already has `offer`/`apply_answer` and the adapter already has `placeCall`/`getCallPermission`; MEC-08 adds a `messenger-permission` governor keyed on the §4-item-7 caps + the `/messenger-calling/calls` (POST) dialing route. Build it *after* the caps are confirmed.
- **MEC-11 (video)** — only if/when Meta GAs programmatic Messenger video (`MESSENGER_VIDEO_GA` flag).

---

## 6. Honesty note (CLAUDE.md §15)

Meta's Messenger Platform + `pages_messaging` + Page-token + HMAC-webhook flow (§2a–d, §3) is well-documented and mirrors the shipped Messenger *messaging* integration. The **calling-specific** low-level details (§2e enablement surface, §4 items 1–7) are **not fully public** and were not directly fetchable during MEC-01 research — they are mapped from Meta's documented WhatsApp Calling sibling and isolated behind single, marked locations so confirming them is a one-file change each. Do **not** flip the module live until §4 is confirmed on a real Page.
