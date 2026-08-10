/**
 * Messenger Calling video / screen-share (MEC-11) — the GA feature-gate. Meta's Messenger Calling API
 * ships WebRTC AUDIO first; video/screen-share for the *programmatic* Page-calling API is not something
 * we negotiate against until it is confirmed GA in the official docs (CLAUDE.md §15). So this is the
 * honest seam: a single GA flag + a media-mode resolver that keeps every Messenger call AUDIO-ONLY until
 * Meta ships (and we confirm) programmatic video. When that happens: re-fetch the real spec, flip
 * {@link MESSENGER_VIDEO_GA}, and implement the m=video negotiation in the bridge + a video pane in the
 * live-call view. Mirrors `whatsapp-video.ts` so both Meta calling channels share one gate shape.
 */

/** Flip to `true` ONLY once Meta GAs Messenger programmatic-calling video (confirm in the official docs). */
export const MESSENGER_VIDEO_GA = false;

/** Codecs to negotiate for the video m-line once GA (re-confirm against Meta's spec at MEC-00/MEC-11). */
export const MESSENGER_VIDEO_CODECS = ['VP8', 'H264'] as const;

export type MeCallMediaMode = 'audio_only' | 'video';

/** Is Messenger video available to use right now? (Always `false` until Meta GA + the flag is flipped.) */
export function messengerVideoAvailable(): boolean {
  return MESSENGER_VIDEO_GA;
}

/**
 * Resolve the media mode for a Messenger call: `video` only when the caller requested it AND video is GA;
 * otherwise `audio_only`. The single gate every media path consults — a video request today safely
 * degrades to voice with no fake negotiation.
 */
export function messengerCallMediaMode(videoRequested?: boolean): MeCallMediaMode {
  return videoRequested && MESSENGER_VIDEO_GA ? 'video' : 'audio_only';
}
