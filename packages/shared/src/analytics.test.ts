import { describe, expect, it } from 'vitest';
import {
  countInterruptions,
  evaluateBudget,
  outcomeCounts,
  successRate,
  talkListen,
} from './analytics.js';

describe('talkListen', () => {
  it('splits agent vs caller talk time', () => {
    const r = talkListen([
      { speaker: 'agent', text: 'x', startMs: 0, endMs: 2000 },
      { speaker: 'caller', text: 'x', startMs: 2000, endMs: 3000 },
      { speaker: 'agent', text: 'x', startMs: 3000, endMs: 4000 },
    ]);
    expect(r.agentMs).toBe(3000);
    expect(r.callerMs).toBe(1000);
    expect(r.agentRatio).toBeCloseTo(0.75);
  });
  it('is 0 for no segments', () => {
    expect(talkListen([]).agentRatio).toBe(0);
  });
});

describe('countInterruptions', () => {
  it('counts talk-overs (new speaker starts before prev ended)', () => {
    const segs = [
      { speaker: 'agent', text: 'x', startMs: 0, endMs: 3000 },
      { speaker: 'caller', text: 'x', startMs: 2000, endMs: 4000 }, // interrupts agent
      { speaker: 'agent', text: 'x', startMs: 4000, endMs: 5000 }, // clean turn
    ];
    expect(countInterruptions(segs)).toBe(1);
  });
  it('ignores same-speaker continuations', () => {
    const segs = [
      { speaker: 'agent', text: 'x', startMs: 0, endMs: 3000 },
      { speaker: 'agent', text: 'x', startMs: 2000, endMs: 4000 },
    ];
    expect(countInterruptions(segs)).toBe(0);
  });
});

describe('outcomeCounts + successRate', () => {
  const rows = [
    { status: 'COMPLETED', disposition: 'BOOKED' },
    { status: 'COMPLETED', disposition: 'BOOKED' },
    { status: 'COMPLETED', disposition: null },
    { status: 'NO_ANSWER', disposition: null },
  ];
  it('keys by disposition then status', () => {
    expect(outcomeCounts(rows)).toEqual({ BOOKED: 2, COMPLETED: 1, NO_ANSWER: 1 });
  });
  it('success = COMPLETED / total', () => {
    expect(successRate(rows)).toBeCloseTo(0.75);
    expect(successRate([])).toBe(0);
  });
});

describe('evaluateBudget', () => {
  it('warns at 80% and criticals at/over 100% of a cap', () => {
    const warn = evaluateBudget({
      todaySpendUsd: 85,
      monthSpendUsd: 100,
      dailyLimitUsd: 100,
      monthlyLimitUsd: 5000,
      trailingDailyAvgUsd: 80,
    });
    expect(warn.alerts.find((a) => a.metric === 'daily')?.level).toBe('warn');
    expect(warn.dailyPct).toBeCloseTo(0.85);

    const crit = evaluateBudget({
      todaySpendUsd: 120,
      monthSpendUsd: 100,
      dailyLimitUsd: 100,
      monthlyLimitUsd: null,
      trailingDailyAvgUsd: 110,
    });
    expect(crit.alerts.find((a) => a.metric === 'daily')?.level).toBe('critical');
    expect(crit.monthlyPct).toBeNull(); // no monthly cap
  });

  it('flags a spend anomaly (today ≥ 3× trailing avg)', () => {
    const s = evaluateBudget({
      todaySpendUsd: 60,
      monthSpendUsd: 200,
      dailyLimitUsd: null,
      monthlyLimitUsd: null,
      trailingDailyAvgUsd: 10,
    });
    expect(s.anomaly).toBe(true);
    expect(s.alerts.some((a) => a.metric === 'anomaly')).toBe(true);
  });

  it('no alerts when under caps and no anomaly', () => {
    const s = evaluateBudget({
      todaySpendUsd: 10,
      monthSpendUsd: 100,
      dailyLimitUsd: 100,
      monthlyLimitUsd: 5000,
      trailingDailyAvgUsd: 12,
    });
    expect(s.alerts).toHaveLength(0);
    expect(s.anomaly).toBe(false);
  });
});
