import { describe, expect, it } from 'vitest';
import {
  VOICE_PRESETS,
  type VoiceView,
  cloneRequestSchema,
  filterVoices,
  isVoiceUsable,
  normalizeVoiceSettings,
} from './voice.js';

const view = (over: Partial<VoiceView>): VoiceView => ({
  id: over.id ?? 'v1',
  provider: 'ELEVENLABS',
  providerVoiceId: 'x',
  name: 'V',
  language: 'en',
  gender: 'female',
  age: 'young',
  accent: 'american',
  style: 'professional',
  isCloned: false,
  approved: true,
  isPreset: false,
  ...over,
});

describe('isVoiceUsable (the consent gate)', () => {
  it('presets and approved clones are usable; unapproved clones are not', () => {
    expect(isVoiceUsable({ isCloned: false, approved: false })).toBe(true); // preset
    expect(isVoiceUsable({ isCloned: true, approved: true })).toBe(true); // approved clone
    expect(isVoiceUsable({ isCloned: true, approved: false })).toBe(false); // pending clone
  });
});

describe('normalizeVoiceSettings', () => {
  it('fills defaults and clamps out-of-range values', () => {
    const s = normalizeVoiceSettings({ stability: 0.3 });
    expect(s.stability).toBe(0.3);
    expect(s.similarity).toBe(0.75); // default
    expect(s.pace).toBe(1);
    expect(() => normalizeVoiceSettings({ stability: 5 })).toThrow(); // > 1 rejected
  });
});

describe('filterVoices', () => {
  const voices = [
    view({ id: 'a', gender: 'female', accent: 'american' }),
    view({ id: 'b', gender: 'male', accent: 'british' }),
    view({ id: 'c', gender: 'female', accent: 'british', isCloned: true, approved: false }),
  ];
  it('filters by attribute', () => {
    expect(
      filterVoices(voices, { gender: 'female', includeCloned: true }).map((v) => v.id),
    ).toEqual(['a', 'c']);
    expect(
      filterVoices(voices, { accent: 'british', includeCloned: true }).map((v) => v.id),
    ).toEqual(['b', 'c']);
  });
  it('can exclude cloned voices', () => {
    expect(filterVoices(voices, { includeCloned: false }).map((v) => v.id)).toEqual(['a', 'b']);
  });
});

describe('cloneRequestSchema', () => {
  it('requires explicit consent and at least one sample', () => {
    const ok = cloneRequestSchema.safeParse({
      name: 'Clone',
      sampleUrls: ['https://example.com/a.mp3'],
      consent: { consentGiven: true, subjectName: 'A', statement: 'I consent.' },
    });
    expect(ok.success).toBe(true);

    const noConsent = cloneRequestSchema.safeParse({
      name: 'Clone',
      sampleUrls: ['https://example.com/a.mp3'],
      consent: { consentGiven: false, subjectName: 'A', statement: 'x' },
    });
    expect(noConsent.success).toBe(false);

    const noSamples = cloneRequestSchema.safeParse({
      name: 'Clone',
      sampleUrls: [],
      consent: { consentGiven: true, subjectName: 'A', statement: 'I consent.' },
    });
    expect(noSamples.success).toBe(false);
  });
});

describe('VOICE_PRESETS', () => {
  it('has unique provider voice ids', () => {
    const ids = VOICE_PRESETS.map((p) => p.providerVoiceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
