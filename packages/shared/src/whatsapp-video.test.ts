import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_VIDEO_GA,
  whatsappCallMediaMode,
  whatsappVideoAvailable,
} from './whatsapp-video.js';

describe('WhatsApp video GA gate (WAC-11)', () => {
  it('is not GA yet — video is unavailable', () => {
    expect(WHATSAPP_VIDEO_GA).toBe(false);
    expect(whatsappVideoAvailable()).toBe(false);
  });

  it('keeps every call audio-only until GA, even when video is requested', () => {
    expect(whatsappCallMediaMode(false)).toBe('audio_only');
    expect(whatsappCallMediaMode(true)).toBe('audio_only'); // gated: no fake negotiation
    expect(whatsappCallMediaMode(undefined)).toBe('audio_only');
  });
});
