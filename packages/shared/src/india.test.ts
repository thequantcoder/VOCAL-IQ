import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SARVAM_VOICE,
  INDIAN_LANGUAGES,
  SARVAM_VOICES,
  baseLanguageCode,
  isIndianLanguage,
  isSarvamVoice,
  primaryLanguage,
} from './india';

describe('india catalog', () => {
  it('baseLanguageCode strips region + lowercases', () => {
    expect(baseLanguageCode('hi-IN')).toBe('hi');
    expect(baseLanguageCode('HI_in')).toBe('hi');
    expect(baseLanguageCode('ta')).toBe('ta');
    expect(baseLanguageCode(null)).toBe('');
    expect(baseLanguageCode(undefined)).toBe('');
  });

  it('isIndianLanguage recognises scheduled languages by base code', () => {
    expect(isIndianLanguage('hi')).toBe(true);
    expect(isIndianLanguage('hi-IN')).toBe(true);
    expect(isIndianLanguage('ta')).toBe(true);
    expect(isIndianLanguage('en')).toBe(false);
    expect(isIndianLanguage('en-US')).toBe(false);
    expect(isIndianLanguage(null)).toBe(false);
  });

  it('primaryLanguage is the first language (undefined when empty)', () => {
    expect(primaryLanguage(['hi', 'en'])).toBe('hi');
    expect(primaryLanguage(['en'])).toBe('en');
    expect(primaryLanguage([])).toBeUndefined();
    expect(primaryLanguage(null)).toBeUndefined();
  });

  it('isSarvamVoice only accepts real Bulbul speakers', () => {
    expect(isSarvamVoice(DEFAULT_SARVAM_VOICE)).toBe(true);
    expect(isSarvamVoice('shubh')).toBe(true);
    expect(isSarvamVoice('priya')).toBe(true);
    expect(isSarvamVoice('not-a-voice')).toBe(false);
    expect(isSarvamVoice('')).toBe(false);
    expect(isSarvamVoice(null)).toBe(false);
    expect(isSarvamVoice(undefined)).toBe(false);
  });

  it('the default voice is a real speaker and the catalog is well-formed', () => {
    expect(SARVAM_VOICES.some((v) => v.id === DEFAULT_SARVAM_VOICE)).toBe(true);
    // ids are unique
    expect(new Set(SARVAM_VOICES.map((v) => v.id)).size).toBe(SARVAM_VOICES.length);
    // every voice has a gender label
    for (const v of SARVAM_VOICES) expect(v.gender === 'male' || v.gender === 'female').toBe(true);
    // languages are unique base codes
    expect(new Set(INDIAN_LANGUAGES.map((l) => l.code)).size).toBe(INDIAN_LANGUAGES.length);
  });
});
