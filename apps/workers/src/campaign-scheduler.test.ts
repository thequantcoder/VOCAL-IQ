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
    dialerConfig: over.dialerConfig ?? {},
  };
}

const NOW = new Date('2026-07-01T12:00:00Z');

/** A pool of due contacts big enough for the power/predictive tests. */
const MANY_DUE = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, nextAttemptAt: null }));

function deps(over: Partial<SchedulerDeps> & { campaigns: SchedulerCampaign[] }): {
  deps: SchedulerDeps;
  dialed: string[];
} {
  const dialed: string[] = [];
  return {
    dialed,
    deps: {
      findRunningCampaigns: async () => over.campaigns,
      findDueContacts: over.findDueContacts ?? (async () => MANY_DUE.slice(0, 3)),
      countInFlight: over.countInFlight ?? (async () => 0),
      countFreeAgents: over.countFreeAgents ?? (async () => 0),
      getDialStats:
        over.getDialStats ??
        (async () => ({ answerRatePercent: 30, abandonRatePercent: 0, abandonFeedLive: true })),
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

  it('power mode dials N:1 against free human agents (blended)', async () => {
    const { deps: d, dialed } = deps({
      campaigns: [
        campaign({
          concurrency: 100,
          pacing: 100,
          dialerConfig: { mode: 'power', blended: true, linesPerAgent: 2 },
        }),
      ],
      countFreeAgents: async () => 3, // 3 free agents × 2 = 6 lines
      findDueContacts: async () => MANY_DUE,
    });
    await runCampaignTick(d, NOW);
    expect(dialed).toHaveLength(6);
  });

  it('predictive mode over-dials by the answer rate, then throttles at the abandon cap', async () => {
    // 2 free agents at a 25% answer rate → dial 8 to expect ~2 connects.
    const over = {
      campaigns: [
        campaign({
          concurrency: 100,
          pacing: 100,
          dialerConfig: { mode: 'predictive', blended: true, minAnswerRatePercent: 10 },
        }),
      ],
      countFreeAgents: async () => 2,
      findDueContacts: async () => MANY_DUE,
    };
    const under = deps({
      ...over,
      getDialStats: async () => ({
        answerRatePercent: 25,
        abandonRatePercent: 0,
        abandonFeedLive: true,
      }),
    });
    await runCampaignTick(under.deps, NOW);
    expect(under.dialed).toHaveLength(8);

    // Abandon rate at the 3% cap → fall back to safe 1:1 (dial only the 2 free agents).
    const capped = deps({
      ...over,
      getDialStats: async () => ({
        answerRatePercent: 25,
        abandonRatePercent: 3,
        abandonFeedLive: true,
      }),
    });
    await runCampaignTick(capped.deps, NOW);
    expect(capped.dialed).toHaveLength(2);
  });

  it('predictive fails SAFE (no over-dial) when abandonment is not monitored (self-audit C)', async () => {
    const { deps: d, dialed } = deps({
      campaigns: [
        campaign({
          concurrency: 100,
          pacing: 100,
          dialerConfig: { mode: 'predictive', blended: true, minAnswerRatePercent: 10 },
        }),
      ],
      countFreeAgents: async () => 2,
      findDueContacts: async () => MANY_DUE,
      // Production stats: no live abandon feed → predictive must stay at safe 1:1 (dial only 2).
      getDialStats: async () => ({
        answerRatePercent: 25,
        abandonRatePercent: 0,
        abandonFeedLive: false,
      }),
    });
    await runCampaignTick(d, NOW);
    expect(dialed).toHaveLength(2);
  });

  it('blended dialing paces to human availability — no free agents, no calls', async () => {
    const { deps: d, dialed } = deps({
      campaigns: [campaign({ dialerConfig: { mode: 'progressive', blended: true } })],
      countFreeAgents: async () => 0,
      findDueContacts: async () => MANY_DUE,
    });
    await runCampaignTick(d, NOW);
    expect(dialed).toHaveLength(0);
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
