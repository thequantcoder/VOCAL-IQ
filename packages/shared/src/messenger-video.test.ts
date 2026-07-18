import { describe, expect, it } from 'vitest';
import {
  MESSENGER_VIDEO_GA,
  messengerCallMediaMode,
  messengerVideoAvailable,
} from './messenger-video.js';

describe('messenger-video — media-mode gate', () => {
  it('video is NOT GA yet, so it is unavailable', () => {
    expect(MESSENGER_VIDEO_GA).toBe(false);
    expect(messengerVideoAvailable()).toBe(false);
  });

  it('always resolves to audio_only until Meta GAs video (even when video is requested)', () => {
    expect(messengerCallMediaMode(false)).toBe('audio_only');
    expect(messengerCallMediaMode(undefined)).toBe('audio_only');
    // A video request today safely degrades to voice — no fake negotiation.
    expect(messengerCallMediaMode(true)).toBe('audio_only');
  });
});
