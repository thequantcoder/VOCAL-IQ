import { describe, expect, it } from 'vitest';
import {
  canAssignNumber,
  canTransitionTicket,
  checkTrialLimit,
  drainCredits,
  isLowBalance,
  totalCredits,
  trialLimitsSchema,
} from './ops.js';

describe('drainCredits (bonus-first — self-audit D)', () => {
  it('spends bonus before prepaid', () => {
    const r = drainCredits({ prepaidCents: 1000, bonusCents: 300 }, 500);
    expect(r.bonusCents).toBe(0); // 300 bonus used
    expect(r.prepaidCents).toBe(800); // 200 from prepaid
    expect(r.drainedCents).toBe(500);
    expect(r.shortfallCents).toBe(0);
  });
  it('reports a shortfall and never goes negative', () => {
    const r = drainCredits({ prepaidCents: 100, bonusCents: 50 }, 400);
    expect(r.prepaidCents).toBe(0);
    expect(r.bonusCents).toBe(0);
    expect(r.drainedCents).toBe(150);
    expect(r.shortfallCents).toBe(250);
  });
  it('totalCredits + isLowBalance', () => {
    expect(totalCredits({ prepaidCents: 100, bonusCents: 50 })).toBe(150);
    expect(isLowBalance({ prepaidCents: 100, bonusCents: 50 }, 200)).toBe(true);
    expect(isLowBalance({ prepaidCents: 300, bonusCents: 0 }, 200)).toBe(false);
  });
});

describe('checkTrialLimit', () => {
  const limits = trialLimitsSchema.parse({ maxAgents: 2, maxCalls: 10, trialDays: 14 });
  it('blocks once the trial has expired', () => {
    const c = checkTrialLimit(limits, { agents: 0, calls: 0, ageDays: 15 }, 'agent');
    expect(c.allowed).toBe(false);
  });
  it('blocks agent/call creation at the cap but allows under it', () => {
    expect(checkTrialLimit(limits, { agents: 2, calls: 0, ageDays: 1 }, 'agent').allowed).toBe(
      false,
    );
    expect(checkTrialLimit(limits, { agents: 1, calls: 0, ageDays: 1 }, 'agent').allowed).toBe(
      true,
    );
    expect(checkTrialLimit(limits, { agents: 0, calls: 10, ageDays: 1 }, 'call').allowed).toBe(
      false,
    );
    expect(checkTrialLimit(limits, { agents: 0, calls: 9, ageDays: 1 }, 'call').allowed).toBe(true);
  });
});

describe('canTransitionTicket', () => {
  it('allows a forward flow and reopen, but nothing out of CLOSED', () => {
    expect(canTransitionTicket('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTicket('RESOLVED', 'IN_PROGRESS')).toBe(true); // reopen
    expect(canTransitionTicket('CLOSED', 'OPEN')).toBe(false);
    expect(canTransitionTicket('OPEN', 'OPEN')).toBe(false);
  });
});

describe('canAssignNumber (per-plan limit)', () => {
  it('allows under the limit, blocks at/over it and when limit is 0', () => {
    expect(canAssignNumber(1, 3)).toBe(true);
    expect(canAssignNumber(3, 3)).toBe(false);
    expect(canAssignNumber(0, 0)).toBe(false);
  });
});
