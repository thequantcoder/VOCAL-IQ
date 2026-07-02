import { describe, expect, it } from 'vitest';
import { type SchedulerCampaign, type SchedulerDeps, runCampaignTick } from './campaign-scheduler';

/** Campaign scheduler tick (Day 28): window gating + caps + failure isolation. */

const OPEN_WINDOW = {
  timezone: 'UTC',
  days: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 0,
  endMinute: 1439,
};
const CLOSED_WINDOW = {
  timezone: 'UTC',
  days: [0, 1, 2, 3, 4, 5, 6],
  startMinute: 0,
  endMinute: 1,
};

function campaign(over: Partial<SchedulerCampaign>): SchedulerCampaign {
  return {
    id: over.id ?? 'c1',
    tenantId: 't1',
    schedule: over.schedule ?? OPEN_WINDOW,
    concurrency: over.concurrency ?? 5,
    pacing: over.pacing ?? 10,
    retryPolicy: {},
  };
}

const NOW = new Date('2026-07-01T12:00:00Z');

function deps(over: Partial<SchedulerDeps> & { campaigns: SchedulerCampaign[] }): {
  deps: SchedulerDeps;
  dialed: string[];
} {
  const dialed: string[] = [];
  return {
    dialed,
    deps: {
      findRunningCampaigns: async () => over.campaigns,
      findDueContacts:
        over.findDueContacts ??
        (async () => [
          { id: 'x1', nextAttemptAt: null },
          { id: 'x2', nextAttemptAt: null },
          { id: 'x3', nextAttemptAt: null },
        ]),
      countInFlight: over.countInFlight ?? (async () => 0),
      dial:
        over.dial ??
        (async (_c, id) => {
          dialed.push(id);
        }),
      log: () => {},
    },
  };
}

describe('runCampaignTick', () => {
  it('dials due contacts within caps when the window is open', async () => {
    const { deps: d, dialed } = deps({ campaigns: [campaign({ pacing: 2 })] });
    const res = await runCampaignTick(d, NOW);
    expect(res.campaignsInWindow).toBe(1);
    expect(res.dialed).toBe(2); // pace caps at 2
    expect(dialed).toHaveLength(2);
  });

  it('skips campaigns outside their calling window', async () => {
    const { deps: d, dialed } = deps({ campaigns: [campaign({ schedule: CLOSED_WINDOW })] });
    const res = await runCampaignTick(d, NOW);
    expect(res.campaignsInWindow).toBe(0);
    expect(dialed).toHaveLength(0);
  });

  it('respects in-flight concurrency', async () => {
    const { deps: d, dialed } = deps({
      campaigns: [campaign({ concurrency: 3, pacing: 10 })],
      countInFlight: async () => 2, // capacity = 1
    });
    await runCampaignTick(d, NOW);
    expect(dialed).toHaveLength(1);
  });

  it('isolates a failing campaign so others still run', async () => {
    const good = campaign({ id: 'good' });
    const bad = campaign({ id: 'bad' });
    const { deps: d, dialed } = deps({
      campaigns: [bad, good],
      countInFlight: async (c) => {
        if (c === 'bad') throw new Error('db down');
        return 0;
      },
      findDueContacts: async () => [{ id: 'g1', nextAttemptAt: null }],
    });
    const res = await runCampaignTick(d, NOW);
    expect(res.dialed).toBe(1); // good still dialed
    expect(dialed).toEqual(['g1']);
  });
});
