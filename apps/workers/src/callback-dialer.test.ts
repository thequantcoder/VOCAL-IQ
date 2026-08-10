import { describe, expect, it } from 'vitest';
import {
  type CallbackDialerDeps,
  type DialOutcome,
  type SchedulerCallback,
  runCallbackDialerTick,
} from './callback-dialer';

/** Callback dialer tick (Day 80): due detection (timezone + window), dial, retry-if-missed. */

// July → America/New_York = UTC-4. 14:00 UTC = 10:00 local (inside 8am–9pm); 06:00 UTC = 02:00 (outside).
const NOW = new Date('2026-07-01T14:00:00Z');
const PAST = new Date('2026-06-01T00:00:00Z');

function callback(over: Partial<SchedulerCallback>): SchedulerCallback {
  return {
    id: over.id ?? 'cb1',
    tenantId: 't1',
    phone: '+15551234567',
    requestedAt: over.requestedAt ?? PAST,
    nextAttemptAt: over.nextAttemptAt ?? null,
    timezone: over.timezone ?? 'America/New_York',
    status: over.status ?? 'scheduled',
    attempts: over.attempts ?? 0,
  };
}

function deps(
  over: Partial<CallbackDialerDeps> & { callbacks: SchedulerCallback[]; outcome?: DialOutcome },
): {
  deps: CallbackDialerDeps;
  dialed: string[];
  completed: string[];
  retried: { id: string; attempts: number }[];
  missed: string[];
} {
  const dialed: string[] = [];
  const completed: string[] = [];
  const retried: { id: string; attempts: number }[] = [];
  const missed: string[] = [];
  return {
    dialed,
    completed,
    retried,
    missed,
    deps: {
      findScheduled: async () => over.callbacks,
      dial:
        over.dial ??
        (async (cb) => {
          dialed.push(cb.id);
          return over.outcome ?? 'enqueued';
        }),
      markCompleted: async (id) => {
        completed.push(id);
      },
      markRetry: async (id, attempts) => {
        retried.push({ id, attempts });
      },
      markMissed: async (id) => {
        missed.push(id);
      },
      log: () => {},
    },
  };
}

describe('runCallbackDialerTick', () => {
  it('dials a due callback inside its calling window', async () => {
    const { deps: d, dialed } = deps({ callbacks: [callback({})] });
    const res = await runCallbackDialerTick(d, NOW);
    expect(res.due).toBe(1);
    expect(dialed).toEqual(['cb1']);
  });

  it('does NOT dial before the requested time', async () => {
    const { deps: d, dialed } = deps({
      callbacks: [callback({ requestedAt: new Date('2026-07-01T20:00:00Z') })],
    });
    await runCallbackDialerTick(d, NOW);
    expect(dialed).toHaveLength(0);
  });

  it('does NOT dial outside legal calling hours (self-audit C)', async () => {
    // 06:00 UTC = 02:00 in New_York → outside the window, even though the time has passed.
    const early = new Date('2026-07-01T06:00:00Z');
    const { deps: d, dialed } = deps({ callbacks: [callback({})] });
    await runCallbackDialerTick(d, early);
    expect(dialed).toHaveLength(0);
  });

  it('skips non-scheduled callbacks', async () => {
    const { deps: d, dialed } = deps({ callbacks: [callback({ status: 'completed' })] });
    await runCallbackDialerTick(d, NOW);
    expect(dialed).toHaveLength(0);
  });

  it('completes on a connected outcome', async () => {
    const { deps: d, completed } = deps({ callbacks: [callback({})], outcome: 'connected' });
    await runCallbackDialerTick(d, NOW);
    expect(completed).toEqual(['cb1']);
  });

  it('retries a missed callback, then gives up at max attempts', async () => {
    // attempts=0 → made 1 → retry (< max 3).
    const first = deps({ callbacks: [callback({ attempts: 0 })], outcome: 'missed' });
    await runCallbackDialerTick(first.deps, NOW, undefined, {
      maxAttempts: 3,
      retryAfterMinutes: 30,
    });
    expect(first.retried).toEqual([{ id: 'cb1', attempts: 1 }]);
    expect(first.missed).toHaveLength(0);

    // attempts=2 → made 3 → give up (== max 3).
    const last = deps({ callbacks: [callback({ attempts: 2 })], outcome: 'missed' });
    await runCallbackDialerTick(last.deps, NOW, undefined, {
      maxAttempts: 3,
      retryAfterMinutes: 30,
    });
    expect(last.missed).toEqual(['cb1']);
    expect(last.retried).toHaveLength(0);
  });

  it('isolates a failing dial so the rest of the tick still runs', async () => {
    const { deps: d, completed } = deps({
      callbacks: [callback({ id: 'bad' }), callback({ id: 'good' })],
      dial: async (cb) => {
        if (cb.id === 'bad') throw new Error('dialer down');
        return 'connected';
      },
    });
    await runCallbackDialerTick(d, NOW);
    expect(completed).toEqual(['good']);
  });
});
