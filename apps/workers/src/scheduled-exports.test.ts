import { describe, expect, it, vi } from 'vitest';
import {
  type DueSchedule,
  type ScheduledExportDeps,
  runScheduledExports,
} from './scheduled-exports';

const NOW = new Date('2026-07-07T12:00:00Z');

function harness(schedules: DueSchedule[], generate?: ScheduledExportDeps['generateExport']) {
  const ran: string[] = [];
  const marked: string[] = [];
  const deps: ScheduledExportDeps = {
    listActiveSchedules: async () => schedules,
    generateExport:
      generate ??
      (async (s) => {
        ran.push(s.id);
        return { rowCount: 3 };
      }),
    markRan: async (id) => {
      marked.push(id);
    },
    log: () => {},
  };
  return { deps, ran, marked };
}

describe('runScheduledExports (self-audit F — due gating)', () => {
  it('runs only DUE schedules and stamps them', async () => {
    const h = harness([
      { id: 'due', tenantId: 't1', kind: 'calls', cadence: 'daily', lastRunAt: null }, // never run → due
      {
        id: 'not-due',
        tenantId: 't2',
        kind: 'usage',
        cadence: 'daily',
        lastRunAt: new Date('2026-07-07T06:00:00Z'), // 6h ago → not due for daily
      },
    ]);
    const res = await runScheduledExports(h.deps, NOW);
    expect(res.considered).toBe(2);
    expect(res.ran).toBe(1);
    expect(h.ran).toEqual(['due']);
    expect(h.marked).toEqual(['due']);
  });

  it('a failing export is skipped (not marked run → retries next tick) and does not abort the loop', async () => {
    const generate = vi.fn(async (s: DueSchedule) => {
      if (s.id === 'bad') throw new Error('boom');
      return { rowCount: 1 };
    });
    const h = harness(
      [
        { id: 'bad', tenantId: 't1', kind: 'calls', cadence: 'daily', lastRunAt: null },
        { id: 'good', tenantId: 't2', kind: 'calls', cadence: 'daily', lastRunAt: null },
      ],
      generate,
    );
    const res = await runScheduledExports(h.deps, NOW);
    expect(res.ran).toBe(1); // only 'good'
    expect(h.marked).toEqual(['good']); // 'bad' NOT marked → will retry
  });
});
