/**
 * WhatsApp Calling video / screen-share (WAC-11) — the GA feature-gate. Meta lists video/screen-share
 * as "in development" for Business Calling (NOT GA), and we never negotiate SDP against an unpublished
 * spec (CLAUDE.md §15). So this ships the honest seam: a single GA flag + a media-mode resolver that
 * keeps every WhatsApp call AUDIO-ONLY until Meta ships video. When Meta GAs it: re-fetch the real spec,
 * flip {@link WHATSAPP_VIDEO_GA}, and implement the m=video negotiation in the bridge + a video pane in
 * the live-call view (see `docs/runbooks/whatsapp-calling-video-design.md`).
 */

/** Flip to `true` ONLY once Meta GAs WhatsApp Business Calling video (confirm in the official docs). */
export const WHATSAPP_VIDEO_GA = false;

/** Codecs to negotiate for the video m-line once GA (per the plan; re-confirm against Meta's spec). */
export const WHATSAPP_VIDEO_CODECS = ['VP8', 'H264'] as const;

export type WaCallMediaMode = 'audio_only' | 'video';

/** Is WhatsApp video available to use right now? (Always `false` until Meta GA + the flag is flipped.) */
export function whatsappVideoAvailable(): boolean {
  return WHATSAPP_VIDEO_GA;
}

/**
 * Resolve the media mode for a WhatsApp call: `video` only when the caller requested it AND video is GA;
 * otherwise `audio_only`. This is the single gate every media path consults — so a video request today
 * safely degrades to voice with no fake negotiation.
 */
export function whatsappCallMediaMode(videoRequested?: boolean): WaCallMediaMode {
  return videoRequested && WHATSAPP_VIDEO_GA ? 'video' : 'audio_only';
}
