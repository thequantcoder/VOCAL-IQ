# Messenger Calling — video / screen-share design note (MEC-11)

> **Status: NOT GA — deferred.** Meta's Messenger Platform Calling API ships WebRTC **audio** first; video /
> screen-share for the *programmatic* Page-calling API is not confirmed GA. We do **not** negotiate SDP
> against an unpublished spec (CLAUDE.md §15). This note is the GA-ready plan; the code ships only the
> honest seam (a GA flag + audio-only gate + plumbed-but-inert `video` fields). The WhatsApp sibling is
> `docs/runbooks/whatsapp-calling-video-design.md` — the two Meta calling channels share one gate shape.
> See `docs/MESSENGER-CALLING-AI-ENGINE-PLAN.md` §A.5/§F.

## What's already in place (the seam)

- **`@vocaliq/shared` `messenger-video.ts`** (MEC-01) — `MESSENGER_VIDEO_GA = false`,
  `messengerVideoAvailable()`, and `messengerCallMediaMode(videoRequested)` which returns `'audio_only'`
  for **every** call until the flag is flipped (so a video request degrades safely to voice, no fake
  negotiation). `MESSENGER_VIDEO_CODECS` (`VP8`/`H264`) is a placeholder to re-confirm against Meta's spec.
- **api media control** (MEC-03) — `MeAnswerRequest`/`MeOfferRequest` carry an optional `video?: boolean`,
  but `HttpMeMediaControl` forwards `video: true` to the voice bridge **only when
  `messengerCallMediaMode()` says `video`** (i.e. GA + requested). Unit-tested (MEC-11) to NOT forward on
  either the inbound answer or the MEC-08 outbound offer path while not GA.
- **voice bridge control** (MEC-03) — `MeAnswerBody`/`MeOfferBody` accept `video: bool = False` (inert
  until GA), so the api→voice contract is already video-shaped.

## The GA checklist (do this the day Meta GAs Messenger video)

1. **Re-fetch the real spec** at the **MEC-00** wire-format spike (video m-line codecs, SDP attributes, any
   new call-webhook/endpoint fields, screen-share signalling, pricing). Do **not** assume — Meta's
   Messenger calling wire format is not fully public and every such spot is marked `[CONFIRM @ MEC-00]`.
2. **Flip the gate**: `MESSENGER_VIDEO_GA = true`; confirm `MESSENGER_VIDEO_CODECS` matches the GA spec.
3. **Bridge (`apps/voice/app/telephony/messenger_webrtc.py`)** — add the `m=video` line to the SDP
   offer/answer; negotiate + relay the video track; handle a separate screen-share track if Meta uses one.
   For an **AI-only agent**, video is **receive-only** (the agent has no camera) unless an avatar is
   attached — tie into the existing `avatars` module for an outgoing video track. For **human takeover**
   (Agent Desk), relay both directions. The audio adapters already live in the shared `webrtc_audio.py`, so
   the video track is purely additive.
4. **Live-call view (MEC-07)** — add a **secondary** video pane; the **cyan waveform stays the audio hero**
   (DESIGN-SYSTEM §5c). Reduced-motion-safe; **graceful audio-only fallback** when the peer declines video.
5. **Cost + lifecycle** — meter any new video pricing via MEC-06 (`messengerCallCostUsd`); reuse all
   existing lifecycle / recording / unified-Call wiring.
6. **Tests** — SDP video negotiation against the GA spec; audio-only fallback when video is declined; UI
   video pane + fallback; metering; tenant-scoped. Ensure the **audio-only path is unaffected**
   (self-audit I).

## Guardrails

- Per-call opt-in; audio remains the default and the hero.
- Never break the MEC-01..08 audio path — video is purely additive.
- No `wa.me`-style deep link and no phone number: entry is a **PSID + Page** (identity unchanged by video).
- Same tenant-scoping / RLS / cost-metering rules as every calling path.
