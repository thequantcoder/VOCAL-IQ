import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMOTION_POLICY,
  type EmotionPolicy,
  NEUTRAL_SETTINGS,
  classifyTone,
  emotionPolicySchema,
  modulate,
  parseEmotionPolicy,
  resolveExpressiveSettings,
} from './emotion-voice.js';
import type { SentimentSignal } from './sentiment-rules.js';

const signal = (over: Partial<SentimentSignal> = {}): SentimentSignal => ({
  sentimentScore: 0,
  anger: 0,
  frustration: 0,
  buyingIntent: 0,
  ...over,
});

const enabled = (over: Partial<EmotionPolicy> = {}): EmotionPolicy =>
  emotionPolicySchema.parse({ enabled: true, ...over });

describe('emotionPolicySchema', () => {
  it('defaults to disabled + balanced with sane thresholds', () => {
    expect(DEFAULT_EMOTION_POLICY).toEqual({
      enabled: false,
      expressiveness: 'balanced',
      maxStyle: 0.6,
      angerThreshold: 0.5,
      negativeThreshold: -0.35,
      positiveThreshold: 0.4,
    });
  });
  it('parseEmotionPolicy tolerates junk and returns defaults', () => {
    expect(parseEmotionPolicy(null)).toEqual(DEFAULT_EMOTION_POLICY);
    expect(parseEmotionPolicy({ enabled: 'nope' })).toEqual(DEFAULT_EMOTION_POLICY);
    expect(parseEmotionPolicy({ enabled: true }).enabled).toBe(true);
  });
});

describe('classifyTone (precedence = appropriateness contract, self-audit A)', () => {
  it('a disabled policy is always neutral, even for an angry caller', () => {
    expect(classifyTone(signal({ anger: 0.99 }), DEFAULT_EMOTION_POLICY)).toBe('neutral');
  });
  it('anger/frustration → reassuring (de-escalation wins)', () => {
    expect(classifyTone(signal({ anger: 0.6 }), enabled())).toBe('reassuring');
    expect(classifyTone(signal({ frustration: 0.7 }), enabled())).toBe('reassuring');
  });
  it('negative sentiment (not angry) → empathetic', () => {
    expect(classifyTone(signal({ sentimentScore: -0.5 }), enabled())).toBe('empathetic');
  });
  it('positive sentiment → upbeat', () => {
    expect(classifyTone(signal({ sentimentScore: 0.6 }), enabled())).toBe('upbeat');
  });
  it('level caller → neutral', () => {
    expect(classifyTone(signal({ sentimentScore: 0.1 }), enabled())).toBe('neutral');
  });
  it('an angry caller who also sounds positive is NEVER upbeat', () => {
    // buying intent + high anger (e.g. "I want to buy but this is RIDICULOUS") → de-escalate.
    expect(classifyTone(signal({ sentimentScore: 0.8, anger: 0.9 }), enabled())).toBe('reassuring');
  });
});

describe('resolveExpressiveSettings', () => {
  it('neutral resolves to the exact neutral baseline', () => {
    expect(resolveExpressiveSettings('neutral', enabled())).toEqual(NEUTRAL_SETTINGS);
  });

  it('upbeat is more animated + a little faster than neutral', () => {
    const s = resolveExpressiveSettings('upbeat', enabled());
    expect(s.style).toBeGreaterThan(NEUTRAL_SETTINGS.style);
    expect(s.speed).toBeGreaterThan(1);
    expect(s.stability).toBeLessThan(NEUTRAL_SETTINGS.stability);
  });

  it('care tones are never sped up and never animated (guardrail)', () => {
    for (const tone of ['empathetic', 'reassuring'] as const) {
      // Even an over-tuned policy (expressive + high maxStyle) cannot break the guardrail.
      const s = resolveExpressiveSettings(
        tone,
        enabled({ expressiveness: 'expressive', maxStyle: 1 }),
      );
      expect(s.speed).toBeLessThanOrEqual(1);
      expect(s.style).toBeLessThanOrEqual(0.2);
      expect(s.stability).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('reassuring is the steadiest tone (de-escalation)', () => {
    const r = resolveExpressiveSettings('reassuring', enabled());
    expect(r.stability).toBeGreaterThanOrEqual(0.7);
    expect(r.style).toBe(0);
  });

  it('maxStyle caps exaggeration for expressive tones', () => {
    const capped = resolveExpressiveSettings('upbeat', enabled({ maxStyle: 0.1 }));
    expect(capped.style).toBeLessThanOrEqual(0.1);
  });

  it('subtle stays closer to neutral than expressive', () => {
    const subtle = resolveExpressiveSettings('upbeat', enabled({ expressiveness: 'subtle' }));
    const expressive = resolveExpressiveSettings(
      'upbeat',
      enabled({ expressiveness: 'expressive' }),
    );
    expect(Math.abs(subtle.style - NEUTRAL_SETTINGS.style)).toBeLessThan(
      Math.abs(expressive.style - NEUTRAL_SETTINGS.style),
    );
  });

  it('all outputs stay within natural bounds', () => {
    for (const tone of ['empathetic', 'reassuring', 'upbeat'] as const) {
      const s = resolveExpressiveSettings(
        tone,
        enabled({ expressiveness: 'expressive', maxStyle: 1 }),
      );
      expect(s.stability).toBeGreaterThanOrEqual(0.15);
      expect(s.stability).toBeLessThanOrEqual(0.95);
      expect(s.similarityBoost).toBeGreaterThanOrEqual(0.5);
      expect(s.similarityBoost).toBeLessThanOrEqual(0.9);
      expect(s.speed).toBeGreaterThanOrEqual(0.85);
      expect(s.speed).toBeLessThanOrEqual(1.12);
    }
  });
});

describe('modulate (end-to-end)', () => {
  it('angry caller → reassuring, calm settings', () => {
    const { tone, settings } = modulate(signal({ anger: 0.8 }), enabled());
    expect(tone).toBe('reassuring');
    expect(settings.speed).toBeLessThanOrEqual(1);
  });
  it('disabled policy → neutral settings regardless of mood', () => {
    const { tone, settings } = modulate(signal({ sentimentScore: 0.9 }), DEFAULT_EMOTION_POLICY);
    expect(tone).toBe('neutral');
    expect(settings).toEqual(NEUTRAL_SETTINGS);
  });
});
