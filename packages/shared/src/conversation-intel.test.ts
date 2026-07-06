import { describe, expect, it } from 'vitest';
import {
  type DetectedSignal,
  aggregateSignals,
  evaluateSignalAlerts,
  extractSignals,
} from './conversation-intel.js';

describe('extractSignals (extraction quality — self-audit A)', () => {
  it('detects a buying signal + pricing interest', () => {
    const s = extractSignals('This looks great, how much does it cost and when can we start?');
    const kinds = s.filter((x) => x.type === 'buying_signal').map((x) => x.label);
    expect(kinds).toContain('pricing_interest');
    expect(kinds).toContain('timeline');
  });

  it('detects a competitor mention only when on the watchlist', () => {
    const text = "We're currently using Acme but it's clunky";
    expect(extractSignals(text, []).some((x) => x.type === 'competitor')).toBe(false);
    const withList = extractSignals(text, ['Acme', 'Globex']);
    const comp = withList.find((x) => x.type === 'competitor');
    expect(comp?.label).toBe('Acme');
    expect(comp?.quote).toMatch(/Acme/);
  });

  it('detects objections, feature requests, and churn risk', () => {
    const s = extractSignals(
      "This is too expensive. Do you support Salesforce? Honestly I'm thinking of leaving.",
      [],
    );
    const types = new Set(s.map((x) => x.type));
    expect(types.has('objection')).toBe(true); // "too expensive" → price
    expect(types.has('feature_request')).toBe(true); // "do you support"
    expect(types.has('churn_risk')).toBe(true); // "thinking of leaving"
  });

  it('finds nothing in a neutral transcript', () => {
    expect(extractSignals('Thanks, that answers my question. Have a good day.', ['Acme'])).toEqual(
      [],
    );
  });
});

describe('aggregateSignals (trends)', () => {
  it('groups by (type,label) and sorts by count desc', () => {
    const signals: DetectedSignal[] = [
      { type: 'competitor', label: 'Acme' },
      { type: 'competitor', label: 'Acme' },
      { type: 'competitor', label: 'Globex' },
      { type: 'objection', label: 'price' },
    ];
    const agg = aggregateSignals(signals);
    expect(agg[0]).toEqual({ type: 'competitor', label: 'Acme', count: 2 });
    expect(agg).toHaveLength(3);
  });
});

describe('evaluateSignalAlerts (alerting)', () => {
  const agg = [
    { type: 'competitor' as const, label: 'Acme', count: 6 },
    { type: 'competitor' as const, label: 'Globex', count: 2 },
    { type: 'churn_risk' as const, label: 'churn_risk', count: 3 },
  ];

  it('fires on a labelled competitor threshold breach', () => {
    const fired = evaluateSignalAlerts(agg, [{ type: 'competitor', label: 'Acme', threshold: 5 }]);
    expect(fired).toEqual([{ type: 'competitor', label: 'Acme', count: 6, threshold: 5 }]);
  });

  it('sums across labels for a type-level rule', () => {
    const fired = evaluateSignalAlerts(agg, [{ type: 'competitor', threshold: 8 }]);
    expect(fired[0]).toMatchObject({ type: 'competitor', label: '*', count: 8 });
  });

  it('does not fire below threshold', () => {
    expect(evaluateSignalAlerts(agg, [{ type: 'churn_risk', threshold: 5 }])).toEqual([]);
  });
});
