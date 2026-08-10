# WhatsApp Calling — video / screen-share design note (WAC-11)

> **Status: NOT GA — deferred.** Meta lists video/screen-share for WhatsApp Business Calling as *"in
> development"*. We do **not** negotiate SDP against an unpublished spec (CLAUDE.md §15). This note is the
> GA-ready plan; the code ships only the honest seam (a GA flag + audio-only gate + plumbed-but-inert
> `video` fields). See `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` §A.1/§F.

## What's already in place (the seam)

- **`@vocaliq/shared` `whatsapp-video.ts`** — `WHATSAPP_VIDEO_GA = false`, `whatsappVideoAvailable()`,
  and `whatsappCallMediaMode(videoRequested)` which returns `'audio_only'` for **every** call until the
  flag is flipped (so a video request degrades safely to voice, no fake negotiation).
- **api media control** — `WaAnswerRequest`/`WaOfferRequest` carry an optional `video?: boolean`, but the
  HTTP client forwards `video: true` to the voice bridge **only when `whatsappCallMediaMode()` says
  `video`** (i.e. GA + requested). Unit-tested to NOT forward while not GA.
- **voice bridge control** — `WaAnswerBody`/`WaOfferBody` accept `video: bool = False` (inert until GA).

## The GA checklist (do this the day Meta GAs video)

1. **Re-fetch the real spec** (video m-line codecs, SDP attributes, any new webhook/endpoint fields,
   screen-share signalling, pricing §A.9). Do **not** assume — Meta changes quarterly.
2. **Flip the gate**: `WHATSAPP_VIDEO_GA = true`; confirm `WHATSAPP_VIDEO_CODECS` matches the GA spec
   (VP8/H.264 today, per the plan — re-confirm).
3. **Bridge (`apps/voice/app/telephony/whatsapp_webrtc.py`)** — add the `m=video` line to the SDP
   offer/answer; negotiate + relay the video track; handle a separate screen-share track if Meta uses
   one. For an **AI-only agent**, video is **receive-only** (the agent has no camera) unless an avatar is
   attached — tie into the existing `avatars` module for an outgoing video track. For **human takeover**
   (Agent Desk), relay both directions.
4. **Live-call view (WAC-04)** — add a **secondary** video pane; the **cyan waveform stays the audio
   hero** (DESIGN-SYSTEM §5c). Reduced-motion-safe; captions remain; **graceful audio-only fallback**
   when the peer declines video.
5. **Cost + lifecycle** — meter any new video pricing via WAC-06; reuse all existing lifecycle/recording.
6. **Tests** — SDP video negotiation against the GA spec; audio-only fallback when video is declined; UI
   video pane + fallback; metering; tenant-scoped. Ensure the **audio-only path is unaffected**
   (self-audit I).

## Guardrails

- Per-call opt-in; audio remains the default and the hero.
- Never break the WAC-00..10 audio path — video is additive.
- Same tenant-scoping / RLS / cost-metering rules as every calling path.
