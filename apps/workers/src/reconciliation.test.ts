import { describe, expect, it, vi } from 'vitest';
import { type UnmeteredCall, runReconciliation } from './reconciliation';

const WINDOW = { from: new Date('2020-01-01'), to: new Date('2020-01-02') };

describe('runReconciliation', () => {
  it('alarms with the offenders when un-metered calls are found', async () => {
    const found: UnmeteredCall[] = [
      { tenantId: 't1', callId: 'c1' },
      { tenantId: 't1', callId: 'c2' },
    ];
    const alarm = vi.fn();
    const log = vi.fn();

    const res = await runReconciliation({ findUnmetered: async () => found, alarm, log }, WINDOW);

    expect(res).toEqual(found);
    expect(alarm).toHaveBeenCalledOnce();
    expect(alarm.mock.calls[0]?.[0]).toContain('2 un-metered');
    expect(alarm.mock.calls[0]?.[1]).toEqual(found);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs all-clear (no alarm) when everything is metered', async () => {
    const alarm = vi.fn();
    const log = vi.fn();

    const res = await runReconciliation({ findUnmetered: async () => [], alarm, log }, WINDOW);

    expect(res).toEqual([]);
    expect(alarm).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
  });
});
