import { describe, expect, it } from 'vitest';
import {
  applyPronunciations,
  detectScriptLanguage,
  multilingualConfigSchema,
  resolveVoice,
  supportsLanguage,
} from './multilingual';

const config = multilingualConfigSchema.parse({
  languages: [
    { code: 'en', voiceId: 'voice-en' },
    { code: 'es', voiceId: 'voice-es' },
    { code: 'fr', voiceId: '' },
  ],
  defaultLanguage: 'en',
  autoDetect: true,
  pronunciations: [
    { term: 'VocalIQ', say: 'Vocal I Q' },
    { term: 'kubectl', say: 'cube control' },
  ],
});

describe('resolveVoice', () => {
  it('returns the language voice, else the default-language voice', () => {
    expect(resolveVoice(config, 'es')).toBe('voice-es');
    expect(resolveVoice(config, 'fr')).toBe('voice-en'); // fr has no voice → default en
    expect(resolveVoice(config, 'de')).toBe('voice-en'); // unknown → default en
  });
});

describe('supportsLanguage', () => {
  it('true when configured or auto-detect is on', () => {
    expect(supportsLanguage(config, 'es')).toBe(true);
    expect(supportsLanguage(config, 'ja')).toBe(true); // autoDetect
    const strict = multilingualConfigSchema.parse({
      languages: [{ code: 'en' }],
      autoDetect: false,
    });
    expect(supportsLanguage(strict, 'es')).toBe(false);
  });
});

describe('applyPronunciations', () => {
  it('replaces terms whole-word, case-insensitively, longest first', () => {
    const out = applyPronunciations('Welcome to VocalIQ, run kubectl now.', config.pronunciations);
    expect(out).toBe('Welcome to Vocal I Q, run cube control now.');
  });
  it('does not touch substrings inside other words', () => {
    expect(applyPronunciations('kubectld', config.pronunciations)).toBe('kubectld');
  });
});

describe('detectScriptLanguage', () => {
  it('detects by script', () => {
    expect(detectScriptLanguage('こんにちは')).toBe('ja');
    expect(detectScriptLanguage('안녕하세요')).toBe('ko');
    expect(detectScriptLanguage('你好世界')).toBe('zh');
    expect(detectScriptLanguage('مرحبا')).toBe('ar');
    expect(detectScriptLanguage('नमस्ते')).toBe('hi');
    expect(detectScriptLanguage('Привет')).toBe('ru');
    expect(detectScriptLanguage('hello there')).toBe('und'); // Latin → undetermined
  });
});
