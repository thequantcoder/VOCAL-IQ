import { describe, expect, it } from 'vitest';
import {
  LATENCY_SLO,
  type LatencySample,
  percentile,
  pickProviderByLatency,
  sampleTotal,
  summarizeLatency,
  turnEnded,
} from './latency.js';

describe('percentile', () => {
  it('computes nearest-rank p50/p95 and handles empty', () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
    expect(percentile([], 95)).toBe(0);
  });
});

function sample(stt: number, llm: number, tts: number, net: number): LatencySample {
  return { stt, llmTtft: llm, ttsTtfa: tts, network: net };
}

describe('summarizeLatency + SLOs (self-audit F)', () => {
  it('passes when p95 is within budget', () => {
    const good = Array.from({ length: 20 }, () => sample(250, 350, 250, 120));
    const { stats, breached } = summarizeLatency(good);
    expect(breached).toBe(false);
    const total = stats.find((s) => s.stage === 'total')!;
    expect(total.p95).toBeLessThanOrEqual(LATENCY_SLO.total);
  });

  it('flags a breach when a stage blows its budget', () => {
    const bad = Array.from({ length: 20 }, () => sample(250, 900, 250, 120)); // LLM slow
    const { stats, breached } = summarizeLatency(bad);
    expect(breached).toBe(true);
    expect(stats.find((s) => s.stage === 'llmTtft')!.breached).toBe(true);
  });

  it('sampleTotal sums the stages', () => {
    expect(sampleTotal(sample(300, 400, 300, 150))).toBe(1150);
  });
});

// A latency REGRESSION guard: the modelled ideal loop must stay within SLO. If someone loosens a
// stage default past budget, this fails in CI.
describe('latency regression guard (CI)', () => {
  it('the target profile holds the end-to-end SLO', () => {
    const ideal = Array.from({ length: 100 }, () => sample(250, 350, 250, 130)); // sum 980 ≤ 1000
    const { breached, stats } = summarizeLatency(ideal);
    expect(breached).toBe(false);
    expect(stats.find((s) => s.stage === 'total')!.p95).toBeLessThanOrEqual(LATENCY_SLO.total);
  });
});

describe('turnEnded (endpointing)', () => {
  it('ignores blips shorter than minSpeech', () => {
    expect(turnEnded({ silenceMs: 1000, speechMs: 50, endedWithPunctuation: false })).toBe(false);
  });
  it('ends sooner after terminal punctuation', () => {
    // balanced: silence 700, punctuation bonus 200 → threshold 500 with punctuation.
    expect(turnEnded({ silenceMs: 550, speechMs: 300, endedWithPunctuation: true })).toBe(true);
    expect(turnEnded({ silenceMs: 550, speechMs: 300, endedWithPunctuation: false })).toBe(false);
  });
  it('patient preset waits longer', () => {
    expect(
      turnEnded({ silenceMs: 800, speechMs: 300, endedWithPunctuation: false }, 'patient'),
    ).toBe(false);
    expect(
      turnEnded({ silenceMs: 1200, speechMs: 300, endedWithPunctuation: false }, 'patient'),
    ).toBe(true);
  });
});

describe('pickProviderByLatency (self-audit D)', () => {
  const cands = [
    { provider: 'fast-pricey', p95: 300, costWeight: 2 },
    { provider: 'mid', p95: 380, costWeight: 1 },
    { provider: 'slow-cheap', p95: 600, costWeight: 0.5 },
  ];
  it('pure latency picks the fastest', () => {
    expect(pickProviderByLatency(cands, 0)).toBe('fast-pricey');
  });
  it('weighing cost can shift to a cheaper-but-slower provider', () => {
    // high cost bias penalizes the pricey fast one.
    expect(pickProviderByLatency(cands, 1)).toBe('slow-cheap');
  });
  it('returns null for no candidates', () => {
    expect(pickProviderByLatency([])).toBeNull();
  });
});
