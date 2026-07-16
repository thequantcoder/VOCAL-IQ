# WAC 00 — Sandbox / Test-Number Spike: prove ONE inbound WhatsApp call end-to-end  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> ⚠️ **This is a de-risking spike, not product code.** The WebRTC/SRTP/OPUS media path is the single biggest unknown in the whole module. Prove it works against Meta on a throwaway number BEFORE building anything permanent. Ship the findings + a working reference, not a feature.

## Prerequisites (admin)
- A **Meta WhatsApp test number** (free, from the app dashboard) OR a **Tech-Partner sandbox** account, with the app subscribed to the WABA + the **`calls`** webhook field.
- `WHATSAPP_TEST_PHONE_NUMBER_ID`, `WHATSAPP_TEST_WABA_ID`, `WHATSAPP_TEST_ACCESS_TOKEN`, `META_APP_SECRET` (for webhook HMAC), `META_WEBHOOK_VERIFY_TOKEN` in `.env`.
- A **public HTTPS tunnel** to localhost (ngrok/cloudflared) so Meta can reach the webhook.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.10 (sandbox) + Part G (prereqs).

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.3 (inbound flow + exact webhook payloads + `/calls` endpoints), §A.8 (media: OPUS 48 kHz, ICE+DTLS+SRTP, first-SRTP-packet rule, 30–60 s accept window), §A.10 (sandbox)**.
- `apps/api/src/messaging/webhook-verify.ts` (`verifyMetaSignature`) + `apps/api/src/main.ts` (raw-body `/public/messaging/whatsapp/:tenantId`) — the existing Meta webhook seam to reuse.
- `apps/voice/app/` — the voice service (where the throwaway WebRTC bridge lives).

## Objective
Prove — **on real Meta infra, on a test number** — the exact inbound lifecycle: **Connect webhook (caller SDP offer) → generate SDP answer → `pre_accept` → `accept` (200 OK) → flow media → hear a tone both ways → `terminate` → Terminate webhook**. Capture the *real* SDP shapes, ICE/DTLS behaviour, timing, and gotchas that the rest of the module depends on. Output = a runnable spike script + a written "what Meta actually does" findings note.

## Step-by-step build (spike — keep it in `apps/voice/spikes/whatsapp_calling/`, do NOT wire into product)
1. **Webhook receiver (throwaway).** A tiny endpoint (reuse `verifyMetaSignature` — do NOT skip HMAC even in the spike) that logs the raw `field:"calls"` payloads verbatim. Verify the Meta webhook **verification handshake** (`hub.challenge`) works over the tunnel. Capture a real **Connect** payload: `calls[].id` (WACID), `session.sdp_type:"offer"`, `session.sdp`, `cta_payload`/`deeplink_payload`.
2. **WebRTC peer (aiortc).** Using `aiortc` (Python), parse the caller's **SDP offer**, create an `RTCPeerConnection`, add an OPUS audio track that plays a **fixed test tone / short WAV**, generate the **SDP answer**. Handle ICE gathering + DTLS. Confirm the OPUS payload/clock (48 kHz) and that you can also *receive* the caller's audio (write it to a WAV to prove decode).
3. **Signaling calls.** `POST /<TEST_PNID>/calls` with `action:"pre_accept"` + `{session:{sdp_type:"answer", sdp}}`, then `action:"accept"`. **Only flow media after the accept `200 OK`.** Send the **first SRTP packet from the business side** (Meta requires this). Then `action:"terminate"`; confirm the **Terminate** webhook (`status`, `duration`).
4. **Measure + document.** Record: real SDP offer/answer text (redacted), ICE candidate types that actually connect, DTLS timing, the accept-window latency, whether pre_accept meaningfully reduced first-word clipping, DTMF (RFC 4733, 8 kHz) presence, and every error hit + fix. Note anything the plan doc got wrong and correct it.
5. **Findings note.** Write `docs/runbooks/whatsapp-calling-spike-findings.md`: the confirmed flow, the exact SDP/media facts, the timing budget, the gotchas (e.g. first-SRTP-packet, media-after-200), and a go/no-go + adjustments for WAC-01..04.

## Definition of Done
- [ ] A **real inbound WhatsApp call** to the test number is answered by the spike; audio flows **both ways** (test tone out, caller audio decoded in); call terminates cleanly; Terminate webhook received with a non-zero `duration`.
- [ ] The webhook **HMAC verification + verify-token handshake** work over the tunnel.
- [ ] `docs/runbooks/whatsapp-calling-spike-findings.md` written with the real SDP/media/timing facts + any plan corrections.
- [ ] Spike code lives under `apps/voice/spikes/` (clearly throwaway), committed for reference; nothing wired into product paths.

## Self-audit focus
Full A–K, but this is a spike so weight: **A (does the real media path actually work end-to-end),** **E (capture every error + the fix),** **C (HMAC verified even here; no token logged),** **J (the findings note is the real deliverable — make it precise).** Explicitly list anything that contradicts the plan doc.

## Commit plan
`chore(voice): WhatsApp Calling inbound media spike + findings [wac-00]` — branch `wac/00-sandbox-spike` → PR → CI green → merge. (Spike code is allowed to be rough; the findings note must be excellent.)

> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and every increment), `git add` → `commit` (descriptive) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.

## Report to admin
Inbound WhatsApp call media path proven (or blockers surfaced). Confirmed SDP/media/timing facts documented. Next: WAC-01 — the production `WhatsAppCallingTelephony` router adapter.
