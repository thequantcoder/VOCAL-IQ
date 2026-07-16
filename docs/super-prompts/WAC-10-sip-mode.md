# WAC 10 — (Optional) SIP mode for PBX tenants  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. **Build only if a target tenant runs a SIP PBX (Asterisk/Kamailio) and wants WhatsApp calls bridged through it.** Otherwise skip — Graph-API+WebRTC (WAC-00..09) is the default and complete.

## Prerequisites (admin)
- A tenant with a **TLS SIP server** (valid public cert, digest auth, **no mTLS** — Meta acts as TLS client and won't present a cert). App mode **Live**. Decision to run this tenant's number in **SIP mode** (which **disables Graph-API calling + hides webhooks by default** for that number).

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.2 (SIP modes), §A.6 (`sip{status,servers[],webhook_delivery}` + `srtp_key_exchange_protocol`), §A.8 (`x-wa-meta-*` headers), plus the full SIP section (INVITE→407→auth, DTLS vs SDES, TLS mandatory, no mTLS, `include_sip_credentials`)** and the **Asterisk integration example** (pjsip.conf/extensions.conf/rtp.conf + the Record-Route/`rewrite_contact=no` ACK fix that otherwise drops calls at ~32 s).
- `apps/api/src/sip/*` (the existing gated SIP trunk engine) + `apps/voice/app/telephony/*`; WAC-01 adapter (`updateSettings` sets `sip`), WAC-06 cost.

## Objective
Let a PBX-owning tenant run their WhatsApp number in **SIP mode** — WhatsApp routes calls via SIP-over-TLS to their SIP server, which bridges to VocalIQ's AI (or their agents). Reuse the existing SIP module; correlate + meter via the `x-wa-meta-*` headers.

## Step-by-step build
1. **SIP config** — via the adapter `updateSettings`, set `calling.sip{status:ENABLED, servers[{hostname,port(5061 TLS), request_uri_user_params}], webhook_delivery}` + `srtp_key_exchange_protocol (DTLS|SDES)`; fetch the Meta-generated SIP digest password via `GET /settings?include_sip_credentials=true`; document the reset procedure (disable→clear servers→re-enable→refetch). Validate TLS reachability (`openssl s_client` check) + warn on mTLS.
2. **Signaling/media via SIP** — outbound: INVITE to `sip:+<num>@wa.meta.vc;transport=tls` → 407 → auth (business number = username, Meta password, realm `wa.meta.vc`) → SDP offer (ICE/DTLS-SRTP or SDES, OPUS). Inbound: Meta INVITEs the SIP server; respond with auth challenge or 200 OK + SDP answer. **Business side sends the first SRTP packet.** Reuse the existing SIP/voice bridge to the AI loop.
3. **Correlation + metering** — parse `x-wa-meta-wacid` (= WACID) to correlate to Calls; `x-wa-meta-user-id`, `x-wa-meta-cta-payload`/`x-wa-meta-deeplink-payload` (user-initiated) for context; on BYE read `x-wa-meta-call-duration` → meter via WAC-06. If `sip.webhook_delivery=ENABLED`, also handle `call_created`/`terminate` (no SDP in them).
4. **Asterisk recipe** — ship a documented reference config (`docs/runbooks/whatsapp-calling-sip-asterisk.md`) with the transport-tls, SDES endpoint template, WhatsApp gateway endpoint/aor/auth, rtp.conf, **and the Record-Route/`rewrite_contact=no` ACK fix** (else calls drop ~32 s).
5. **Tests** — settings toggle to SIP mode disables Graph-API calling for that number (guard against mixing); header parsing → WACID correlation + context + duration metering; SDES vs DTLS config; tenant-scoped.

## Definition of Done
- [ ] A PBX tenant can run their WhatsApp number in SIP mode; inbound + outbound bridge through their SIP server to the AI/agents; calls correlate (WACID) + meter (duration header).
- [ ] SIP config (servers/credentials/SDES-or-DTLS/webhook_delivery) managed via the adapter; TLS validated; no-mTLS + Record-Route ACK gotchas documented + handled.
- [ ] Graph-API calling is disabled for a SIP-mode number (no mixing); tests pass.

## Self-audit focus
Full A–K. Special attention: **I (SIP mode must not break WAC-00..09 Graph-API tenants — it's per-number, opt-in), A (auth/INVITE/SDP correctness + the ACK fix), D (duration metering via `x-wa-meta-call-duration`), B (tenant-scoped).**

## Commit plan
`feat(api,voice): WhatsApp SIP-mode calling for PBX tenants [wac-10]` — branch `wac/10-sip-mode` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
SIP-mode WhatsApp calling available for PBX tenants. Next (optional): WAC-11 — video/screen-share when Meta GA's them.
