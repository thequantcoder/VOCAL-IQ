# WAC 03 — Voice-service WhatsApp ↔ AI WebRTC media bridge  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> 🧠 **The hardest, most important day in the module.** This is the real-time media plane. Lean on the WAC-00 findings for the exact SDP/ICE/DTLS/OPUS/timing facts.

## Prerequisites (admin)
- LiveKit/STT/TTS/LLM keys (already used by the loop). The test number from WAC-00 for live verification.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.8 (OPUS 48 kHz payload 111, ICE+DTLS-SRTP, first-SRTP-packet rule, DTMF RFC 4733 @ 8 kHz), §A.3 (media-only-after-200, pre_accept), §C.3 item 3**. + `docs/runbooks/whatsapp-calling-spike-findings.md`.
- `apps/voice/app/loop/livekit_agent.py`, `apps/voice/app/calls/livekit_service.py`, `apps/voice/app/calls/lifecycle.py` — the **existing Pipecat/LiveKit AI loop** (STT→LLM→TTS) to reuse as the brain.
- `apps/voice/app/telephony/twilio_dialer.py` + `amd.py` — the telephony-bridge pattern to mirror.
- WAC-02 control-channel contract (`requestSdpAnswer`, `endCall`).

## Objective
Terminate a **raw WebRTC peer with Meta** (ICE + DTLS-SRTP + OPUS 48 kHz) for each WhatsApp call and bridge its audio **bidirectionally into the existing AI loop** (Deepgram STT → LLM → ElevenLabs TTS) — reusing the same brain that powers PSTN/web, so persona/flow/memory/tools all "just work" on WhatsApp. Meet the < ~800 ms turn target.

## Step-by-step build
1. **WebRTC bridge** `apps/voice/app/telephony/whatsapp_webrtc.py` (using **aiortc** or Pipecat's WebRTC transport — pick per WAC-00 findings): parse the caller **SDP offer**, build an `RTCPeerConnection`, negotiate **OPUS 48 kHz**, generate the **SDP answer**, run ICE + DTLS. This is a **P2P leg to Meta**, not the LiveKit SFU. Expose the answer back to `apps/api` via the WAC-02 control channel within the accept window.
2. **Media ↔ AI loop bridge** — pipe the decoded inbound OPUS frames into the Pipecat pipeline's audio-in, and the TTS audio-out back onto the WebRTC track. Reuse `loop/livekit_agent.py` as the agent brain (same persona/flow/RAG/tools/memory). **Send the first SRTP packet from the business side** (Meta requires it). Start speaking only after the api confirms the `accept` 200 OK (avoid clipping/silence).
3. **DTMF** — decode RFC 4733 telephone-event (8 kHz) inband from the RTP (no webhook exists for DTMF) and surface digits to the flow (e.g. a "collect" node).
4. **Control endpoint** — an internal HTTP/gRPC endpoint the api calls: `POST /wa/answer {callId, sdpOffer, tenantId, agentId} → {sdpAnswer}` and `POST /wa/end {callId}`. Auth this internal hop (shared secret/mTLS); never public.
5. **Lifecycle + teardown** — on hangup (either side), stop tracks, close the peer, flush transcript/metrics; report call end (duration, media stats) so the api can meter (WAC-06). Robust to ICE failure / DTLS timeout / no-audio (fail the call cleanly, never hang).
6. **Recording/transcription hook** — write the call audio + transcript through the existing recording/transcription path (channel=WHATSAPP) so search/QA/intel work unchanged.
7. **Tests** — unit: SDP offer→answer negotiation picks OPUS 48 kHz; DTMF decode; teardown idempotent; first-packet + media-after-accept ordering. Integration (against WAC-00 test number, documented as a manual/gated live check): a real WhatsApp call is answered by the **actual AI agent** and holds a short conversation, recorded + transcribed.

## Definition of Done
- [ ] A real inbound WhatsApp call is answered by the **live AI agent** (same brain as PSTN/web); two-way audio; agent responds naturally; call recorded + transcribed (channel=WHATSAPP).
- [ ] SDP answer returns to the api inside the accept window; first SRTP packet sent by business; media flows only after accept 200 OK.
- [ ] DTMF decoded; clean teardown on every failure mode; media stats reported for metering.
- [ ] `pytest` (voice) green; typecheck/lint green for touched TS.

## Self-audit focus
Full A–K. Special attention: **F (latency parity with PSTN/web; media co-located; no clipping/silence), A (SDP/OPUS/DTMF/first-packet correctness), E (every media failure fails the call cleanly — never a stuck peer), G (internal control endpoint is authed, not public — SSRF-safe, only Meta's negotiated candidates).**

## Commit plan
`feat(voice): WhatsApp WebRTC media bridge into the AI loop [wac-03]` — branch `wac/03-webrtc-media-bridge` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
The AI voice agent now talks over WhatsApp calls (real media). Next: WAC-04 — inbound GA (routing, context, live-call UI) — ship it.
