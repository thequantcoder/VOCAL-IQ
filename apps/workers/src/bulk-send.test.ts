import { describe, expect, it, vi } from 'vitest';
import {
  type BulkJobSpec,
  type BulkRecipientRow,
  type BulkSendDeps,
  createInternalSend,
  runBulkSendTick,
} from './bulk-send';

/** GME-DQ-c: the pure bulk-send tick — drains PENDING recipients through the injected send, mapping
 *  each outcome to the right row status, and marks a drained job DONE. No Redis/HTTP/Postgres. */

const job: BulkJobSpec = {
  id: 'job1',
  tenantId: 't1',
  channel: 'SMS',
  templateId: null,
  body: 'hi',
  variables: {},
  requireConsent: true,
  respectQuietHours: true,
};

function makeDeps(
  recipients: BulkRecipientRow[],
  send: BulkSendDeps['send'],
  running: BulkJobSpec[] = [job],
): {
  deps: BulkSendDeps;
  marks: Array<{ id: string; status: string; attempts: number }>;
  done: string[];
} {
  const marks: Array<{ id: string; status: string; attempts: number }> = [];
  const done: string[] = [];
  let served = false;
  const deps: BulkSendDeps = {
    findRunningJobs: async () => running,
    findPendingRecipients: async () => {
      if (served) return []; // second call (or a re-drain) is empty
      served = true;
      return recipients;
    },
    send,
    markRecipient: async (id, status, attempts) => {
      marks.push({ id, status, attempts });
    },
    markJobDone: async (jobId) => {
      done.push(jobId);
    },
    log: () => {},
  };
  return { deps, marks, done };
}

describe('runBulkSendTick', () => {
  it('maps SENT / SKIPPED / RETRY outcomes to the right recipient status', async () => {
    const recipients: BulkRecipientRow[] = [
      { id: 'a', toAddr: '+1', attempts: 0 },
      { id: 'b', toAddr: '+2', attempts: 0 },
      { id: 'c', toAddr: '+3', attempts: 0 },
    ];
    const send = vi.fn(async (_j: BulkJobSpec, to: string) => {
      if (to === '+1') return { status: 'SENT' as const };
      if (to === '+2') return { status: 'SKIPPED' as const, reason: 'opted out' };
      return { status: 'RETRY' as const, reason: 'carrier 503' };
    });
    const { deps, marks } = makeDeps(recipients, send);
    const res = await runBulkSendTick(deps, { maxAttempts: 3 });

    expect(res).toMatchObject({ sent: 1, skipped: 1, retried: 1, failed: 0 });
    expect(marks.find((m) => m.id === 'a')?.status).toBe('SENT');
    expect(marks.find((m) => m.id === 'b')?.status).toBe('SKIPPED');
    // A transient failure on attempt 1 (< maxAttempts) stays PENDING for the next tick.
    expect(marks.find((m) => m.id === 'c')).toMatchObject({ status: 'PENDING', attempts: 1 });
  });

  it('gives up (FAILED) once a recipient hits maxAttempts', async () => {
    const recipients: BulkRecipientRow[] = [{ id: 'x', toAddr: '+9', attempts: 2 }]; // already tried twice
    const send = vi.fn(async () => ({ status: 'RETRY' as const, reason: 'still failing' }));
    const { deps, marks } = makeDeps(recipients, send);
    const res = await runBulkSendTick(deps, { maxAttempts: 3 });
    expect(res.failed).toBe(1);
    expect(marks[0]).toMatchObject({ id: 'x', status: 'FAILED', attempts: 3 });
  });

  it('marks a job DONE when it has no PENDING recipients left', async () => {
    const send = vi.fn(async () => ({ status: 'SENT' as const }));
    const { deps, done } = makeDeps([], send); // no pending
    const res = await runBulkSendTick(deps, {});
    expect(done).toEqual(['job1']);
    expect(res.sent).toBe(0);
  });

  it('isolates one job failure so the tick still returns', async () => {
    const send = vi.fn(async () => ({ status: 'SENT' as const }));
    const deps: BulkSendDeps = {
      findRunningJobs: async () => [job],
      findPendingRecipients: async () => {
        throw new Error('db blew up');
      },
      send,
      markRecipient: async () => {},
      markJobDone: async () => {},
      log: () => {},
    };
    const res = await runBulkSendTick(deps, {});
    expect(res.jobsConsidered).toBe(1); // no throw
  });
});

describe('createInternalSend', () => {
  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  it('maps a SENT response to SENT, and SKIPPED/QUEUED to a permanent SKIPPED', async () => {
    const sentFetch = vi.fn(async () => ok({ status: 'SENT', id: 'm1' }));
    const send1 = createInternalSend('http://api', 'sec', sentFetch as unknown as typeof fetch);
    expect(await send1(job, '+1')).toEqual({ status: 'SENT' });
    const [url, init] = sentFetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('http://api/internal/messaging/send');
    expect(init.headers['x-internal-secret']).toBe('sec');

    const skipFetch = vi.fn(async () => ok({ status: 'SKIPPED', reason: 'no consent' }));
    const send2 = createInternalSend('http://api', 'sec', skipFetch as unknown as typeof fetch);
    expect(await send2(job, '+1')).toEqual({ status: 'SKIPPED', reason: 'no consent' });
  });

  it('maps a non-2xx / network error to a transient RETRY', async () => {
    const bad = vi.fn(
      async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response,
    );
    const send = createInternalSend('http://api', 'sec', bad as unknown as typeof fetch);
    expect((await send(job, '+1')).status).toBe('RETRY');

    const boom = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const send2 = createInternalSend('http://api', 'sec', boom as unknown as typeof fetch);
    const out = await send2(job, '+1');
    expect(out.status).toBe('RETRY');
    expect(out.reason).toMatch(/ECONNREFUSED/);
  });
});
