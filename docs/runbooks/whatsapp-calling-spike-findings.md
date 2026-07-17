# WhatsApp Calling — inbound media spike findings (WAC-00)

> Deliverable of the WAC-00 de-risking spike (`apps/voice/spikes/whatsapp_calling/`). Records the
> **inbound** WhatsApp-call media path so WAC-03 (the production `whatsapp_webrtc.py` bridge) is built
> on facts, not guesses. Two kinds of fact below: **[DOC]** = from Meta's WhatsApp Calling docs + the
> module plan (`docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.3/§A.8), authoritative for build-time;
> **[LIVE ▢]** = to be **measured on the first live run** against the test number and checked off here.
>
> Status: **spike code written; live run pending the admin's WAC-00 test creds + tunnel.** Update the
> `[LIVE ▢]` rows (→ `[LIVE ✓]`) after the first real call, and correct any `[DOC]` row the live run
> contradicts (note the discrepancy in `BUILD-LOG.md`, per CLAUDE.md §15).

## 1. Confirmed lifecycle (inbound / user-initiated)

```
WhatsApp user taps "Call"
   │
   ▼  Meta → your webhook  (field:"calls", event:"connect", session.sdp_type:"offer")
[api]  verify X-Hub-Signature-256 → tenant by phone_number_id → hand SDP offer to voice
   │
   ▼  [voice]  aiortc: setRemoteDescription(offer) → addTrack(agent audio) → createAnswer()
[api]  POST /<PNID>/calls  action="pre_accept"  {session:{sdp_type:"answer", sdp}}   ── establish early
[api]  POST /<PNID>/calls  action="accept"      {session:{sdp_type:"answer", sdp}}   ── 200 OK
   │
   ▼  MEDIA FLOWS **only after** the accept 200 OK.  Business side sends the FIRST SRTP packet.
WhatsApp  ◄══ SRTP/OPUS ══►  aiortc peer  ⇄  Pipecat loop (Deepgram STT → LLM → ElevenLabs TTS)
   │
   ▼  either side hangs up → Meta → your webhook (event:"terminate", status, duration)
[api]  meter cost (WAC-06) from duration; tear down the peer.
```
**[DOC]** `pre_accept` before `accept` establishes WebRTC early and avoids first-word clipping.
**[DOC]** Media must not flow until the `accept` returns 200 OK; the **business** side sends the first
SRTP packet (true for both DTLS-SRTP and SDES). Error 138006 = no permission (outbound only).

## 2. Media facts (build to these)

| Fact | Value | Source |
|---|---|---|
| Transport | ICE + DTLS-SRTP (WebRTC default) | **[DOC]** §A.8 |
| Primary codec | **OPUS**, payload **111**, **48 kHz / 2ch**, `useinbandfec=1`, `maxaveragebitrate=20000`, `maxplaybackrate=16000` | **[DOC]** §A.8 |
| Optional codecs | G.711 PCMU(0) / PCMA(8) @ 8 kHz (transcode; interop only) | **[DOC]** §A.8 |
| DTMF | RFC 4733 telephone-event, **8000 Hz clock only**, **no webhook** — must read from RTP | **[DOC]** §A.3/§A.8 |
| First SRTP packet | sent by the **business** side | **[DOC]** §A.8 |
| Accept window | ~**30–60 s** to answer after Connect | **[DOC]** §A.3 |
| Real SDP offer (redacted) | paste a sanitized copy | **[LIVE ▢]** |
| ICE candidate types that actually connect (host/srflx/relay) | measure | **[LIVE ▢]** |
| DTLS handshake time | measure | **[LIVE ▢]** |
| Answer-ready latency (offer → local answer w/ candidates) | measure (`answer_in` log) | **[LIVE ▢]** |
| Did `pre_accept` measurably cut first-word clipping? | A/B with and without | **[LIVE ▢]** |
| DTMF telephone-event present in RTP? payload number? | inspect | **[LIVE ▢]** |
| Two-way audio (tone out, caller WAV in) confirmed | listen + check `caller-<id>.wav` | **[LIVE ▢]** |
| Terminate `duration` non-zero | check webhook | **[LIVE ▢]** |

## 3. aiortc specifics validated in the spike

- `RTCPeerConnection` + `setRemoteDescription(offer)` → `createAnswer()` → `setLocalDescription()`; the
  returned `pc.localDescription.sdp` carries gathered ICE candidates (non-trickle — simplest vs Meta).
- The agent's audio is a `MediaStreamTrack.recv()` returning 20 ms **s16 mono @ 48 kHz** `av.AudioFrame`s;
  aiortc encodes them to OPUS on the wire (so the bridge works in PCM, aiortc owns the codec).
- The caller's track is decoded by aiortc to `av.AudioFrame` — the spike writes it to a WAV via
  `aiortc.contrib.media.MediaRecorder` to prove decode. **[LIVE ▢]** confirm the WAV is audible.
- **Gotcha:** keep the `RTCPeerConnection` referenced until terminate, or Python GC drops the peer and
  media stalls (~seconds in). The spike holds them in `_peers`.

## 4. Timing budget (target: parity with PSTN/web, < ~800 ms turn)

| Segment | Budget | Note |
|---|---|---|
| Connect → answer returned to api | < 2 s (inside accept window) | co-locate voice + api; non-trickle ICE |
| accept 200 → first business SRTP | immediate | Meta requires business-first |
| STT + LLM + TTS turn | < ~800 ms | reuse the existing loop (no added hops) |

## 5. Gotchas → design rules for WAC-03

1. **Media-after-200** — never send SRTP before `accept` returns 200 OK. Sequence in the api, not voice.
2. **First-packet-from-business** — start emitting the agent track (silence is fine) right after accept.
3. **pre_accept early** — return the SDP answer fast; call `pre_accept` then `accept` to warm the path.
4. **OPUS 48 kHz ↔ loop 16 kHz** — resample at the aiortc boundary (`av.AudioResampler`), keep the loop
   in PCM16@16k (as LiveKit does). Do NOT change the engine.
5. **DTMF from RTP** — no webhook; decode RFC 4733 @ 8 kHz off the media if a "collect" flow needs it.
6. **Fail cleanly** — ICE failure / DTLS timeout / no-audio must terminate the call, never a stuck peer.
7. **Security** — HMAC-verify every webhook; treat SDP/ICE from Meta as untrusted; never log tokens/SDP;
   media only to Meta's negotiated candidates (SSRF-safe).
8. **SIP `rewrite_contact=no` / Record-Route ACK fix** — only relevant if a tenant runs SIP mode (WAC-10),
   where calls otherwise drop at ~32 s. N/A for the Graph-API+WebRTC default.

## 6. Go / no-go

- **Build-time go:** the documented flow + aiortc API are consistent with the plan; the spike encodes
  the exact sequence WAC-03 will productionize. **Proceed to WAC-03 gated** on live verification.
- **Live go criteria (check on first run):** all `[LIVE ▢]` rows resolved, two-way audio confirmed,
  terminate `duration` non-zero, no stuck peers across 3 consecutive calls.

## 7. Plan corrections

_None yet — fill in after the live run if Meta's real behaviour differs from any **[DOC]** row above._
