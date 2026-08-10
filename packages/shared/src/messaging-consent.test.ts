import { describe, expect, it } from 'vitest';
import {
  type ConsentIntent,
  detectConsentIntent,
  setMessagingConsentSchema,
} from './messaging-consent.js';

/** GME-14: messaging-consent core — transcript intent heuristic + the set-consent API schema. */

describe('detectConsentIntent', () => {
  const grant = (t: string): ConsentIntent | null => detectConsentIntent(t);

  it('reads an affirmative "text me" as SMS consent', () => {
    expect(grant('Yes, please text me the details')).toEqual({ granted: true, channels: ['SMS'] });
  });

  it('picks the named channel (WhatsApp)', () => {
    expect(grant('Sure, send it to me on WhatsApp')).toEqual({
      granted: true,
      channels: ['WHATSAPP'],
    });
  });

  it('captures multiple channels in one utterance', () => {
    expect(grant('Yes, message me on WhatsApp and SMS')).toEqual({
      granted: true,
      channels: ['WHATSAPP', 'SMS'],
    });
  });

  it('treats a negative as a decline even with a channel + affirmative-looking words', () => {
    expect(grant("No, don't text me")).toEqual({ granted: false, channels: ['SMS'] });
    expect(grant('No thanks, not by SMS')).toEqual({ granted: false, channels: ['SMS'] });
  });

  it('accepts a send-cue with no explicit channel (defaults to SMS)', () => {
    expect(grant('Yes, go ahead and send me the details')).toEqual({
      granted: true,
      channels: ['SMS'],
    });
  });

  it('returns null when there is no consent topic', () => {
    expect(grant("What's the weather like today?")).toBeNull();
  });

  it('returns null when the channel is mentioned but no decision is expressed', () => {
    expect(grant('You can reach me by text at this number')).toBeNull();
  });
});

describe('setMessagingConsentSchema', () => {
  it('defaults basis + region and requires at least one channel', () => {
    const parsed = setMessagingConsentSchema.parse({
      phone: '+15551230000',
      channels: ['SMS'],
      granted: true,
    });
    expect(parsed.basis).toBe('in_call_consent');
    expect(parsed.region).toBe('US');
    expect(() =>
      setMessagingConsentSchema.parse({ phone: '+1', channels: [], granted: true }),
    ).toThrow();
  });
});
