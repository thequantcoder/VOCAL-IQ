import { describe, expect, it } from 'vitest';
import {
  type EvaluableRule,
  type SentimentSignal,
  evaluateSentimentRules,
  sentimentRuleSchema,
} from './sentiment-rules.js';

const calm: SentimentSignal = {
  sentimentScore: 0.5,
  anger: 0.1,
  frustration: 0.1,
  buyingIntent: 0.2,
};
const angry: SentimentSignal = {
  sentimentScore: -0.8,
  anger: 0.85,
  frustration: 0.7,
  buyingIntent: 0.1,
};

const rules: EvaluableRule[] = [
  {
    id: 'r-esc',
    metric: 'anger',
    operator: 'gt',
    threshold: 0.7,
    action: 'escalate',
    cooldownSec: 60,
  },
  {
    id: 'r-alert',
    metric: 'anger',
    operator: 'gt',
    threshold: 0.5,
    action: 'alert_supervisor',
    cooldownSec: 60,
  },
  {
    id: 'r-tone',
    metric: 'sentimentScore',
    operator: 'lt',
    threshold: -0.6,
    action: 'tone_shift',
    cooldownSec: 45,
    toneHint: 'empathetic',
  },
  {
    id: 'r-buy',
    metric: 'buyingIntent',
    operator: 'gt',
    threshold: 0.75,
    action: 'alert_supervisor',
    cooldownSec: 120,
  },
];

describe('sentimentRuleSchema', () => {
  it('validates a rule + defaults the cooldown', () => {
    const r = sentimentRuleSchema.parse({
      metric: 'anger',
      operator: 'gt',
      threshold: 0.7,
      action: 'escalate',
    });
    expect(r.cooldownSec).toBe(30);
    expect(() =>
      sentimentRuleSchema.parse({
        metric: 'nope',
        operator: 'gt',
        threshold: 0.5,
        action: 'escalate',
      }),
    ).toThrow();
  });
});

describe('evaluateSentimentRules (trigger correctness — self-audit A)', () => {
  it('fires nothing for a calm signal', () => {
    expect(evaluateSentimentRules(calm, rules, {}, 1000)).toEqual([]);
  });

  it('fires escalate + alert + tone_shift for an angry, negative signal', () => {
    const fired = evaluateSentimentRules(angry, rules, {}, 1000);
    const actions = fired.map((f) => f.action).sort();
    expect(actions).toEqual(['alert_supervisor', 'escalate', 'tone_shift']);
    const tone = fired.find((f) => f.action === 'tone_shift');
    expect(tone?.toneHint).toBe('empathetic');
  });

  it('respects the operator direction (lt vs gt)', () => {
    // sentimentScore -0.8 < -0.6 → tone rule fires; a positive score would not.
    expect(
      evaluateSentimentRules({ ...calm, sentimentScore: -0.7 }, [rules[2]!], {}, 0),
    ).toHaveLength(1);
    expect(
      evaluateSentimentRules({ ...calm, sentimentScore: 0.2 }, [rules[2]!], {}, 0),
    ).toHaveLength(0);
  });
});

describe('cooldown / debounce (real-time, no storms — self-audit F)', () => {
  it('does NOT re-fire a rule inside its cooldown window', () => {
    const now = 100_000;
    const lastFired = { 'r-esc': now - 30_000 }; // fired 30s ago, cooldown 60s
    const fired = evaluateSentimentRules(angry, [rules[0]!], lastFired, now);
    expect(fired).toHaveLength(0); // still cooling down
  });

  it('re-fires once the cooldown has elapsed', () => {
    const now = 100_000;
    const lastFired = { 'r-esc': now - 61_000 }; // 61s ago, cooldown 60s
    const fired = evaluateSentimentRules(angry, [rules[0]!], lastFired, now);
    expect(fired).toHaveLength(1);
  });
});
