# WAC 11 — (Optional) Video / screen-share when Meta GA's them  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`. **Build only when Meta ships video/screen-share for WhatsApp Business Calling out of "in development".** Until then this is a placeholder + a design note. Re-read the docs the day you start (Meta changes quarterly — CLAUDE.md §15).

## Prerequisites (admin)
- Meta has **GA'd video and/or screen-share** for the Business Calling API (confirm in the official docs). WAC-03/04 merged (the media bridge + live-call view to extend).

> Missing (feature not GA)? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) stating "WhatsApp video/screen-share not yet GA per Meta docs — WAC-11 deferred" and stop.

## Context to load
- The **current** Meta calling docs (fetch fresh — video/screen-share signaling, SDP media lines, any new webhook/endpoint fields).
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — §A.1 (video/screen-share "in development"), §F (scope v3).
- WAC-03 media bridge (`apps/voice/app/telephony/whatsapp_webrtc.py`) + WAC-04 live-call view — the extension points.

## Objective
Extend the WhatsApp media bridge + live-call view to support **video** (and screen-share) so the AI/agent experience can include vision where it adds value (e.g. an agent-assisted visual support session, or an AI that can "see" a shared screen if/when multimodal is wired) — reusing the existing WebRTC bridge + UI, not a rewrite.

## Step-by-step build (fill in against the real GA docs)
1. **Media negotiation** — add a video `m=` line (VP8/VP9/H.264 per Meta's GA spec) to the SDP offer/answer in the WebRTC bridge; negotiate + relay the video track; handle screen-share track if separate.
2. **AI/agent path** — for an AI-only agent, video is typically receive-only (the agent has no camera) unless an avatar is used (tie to the existing `avatars` module); for human-takeover (Agent Desk), relay both directions.
3. **Live-call view** — extend WAC-04's view with a video pane (waveform stays the audio hero; video is secondary), reduced-motion-safe, a11y (captions remain), graceful audio-only fallback.
4. **Cost + lifecycle** — video may change pricing/bandwidth (re-read §A.9); meter accordingly via WAC-06. Reuse all lifecycle/recording.
5. **Tests** — SDP video negotiation; audio-only fallback when the peer declines video; UI renders video pane + fallback; metering updated; tenant-scoped.

## Definition of Done
- [ ] (When GA) WhatsApp video/screen-share negotiated + relayed through the existing bridge; live-call view shows video with audio-only fallback; metering correct.
- [ ] Reuses the WAC-03 bridge + WAC-04 UI + `avatars`/Agent Desk — no rewrite.
- [ ] Tests pass; typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **A (SDP video correctness against the ACTUAL GA spec — re-fetched, not assumed), H (video UI stays on-brand; audio remains the hero; accessible; reduced-motion), D (any new pricing metered), I (audio-only path unaffected).**

## Commit plan
`feat(voice,web): WhatsApp video/screen-share [wac-11]` — branch `wac/11-video-screenshare` → PR → CI green → merge. **This completes the WhatsApp Calling module.**

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
WhatsApp Calling module complete (incl. video, once GA). Tag a release. VocalIQ's AI voice agent now spans PSTN, SIP, web, and WhatsApp voice (+ video).
