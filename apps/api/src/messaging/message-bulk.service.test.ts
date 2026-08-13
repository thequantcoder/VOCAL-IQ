import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessageBulkService } from './message-bulk.service';

/**
 * Durable bulk send (GME-DQ-b) against real Postgres + RLS. Proves: enqueue persists a job + one
 * PENDING recipient per de-duplicated address, status aggregates the recipient counts, and a child
 * tenant can't read another tenant's bulk job (RLS).
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const svc = new MessageBulkService(db);

const jobIds: string[] = [];

afterAll(async () => {
  // Recipients cascade on job delete.
  await db.admin.messageBulkJob.deleteMany({ where: { id: { in: jobIds } } });
});

describe('MessageBulkService (GME-DQ-b)', () => {
  it('enqueues a job + one PENDING recipient per de-duplicated address', async () => {
    const res = await svc.enqueue(C1, {
      channel: 'SMS',
      body: 'Big announcement!',
      recipients: ['+15551000001', '+15551000002', '+15551000001'], // dup
    });
    jobIds.push(res.jobId);
    expect(res.total).toBe(2); // de-duped

    const recips = await db.admin.messageBulkRecipient.findMany({ where: { jobId: res.jobId } });
    expect(recips).toHaveLength(2);
    expect(recips.every((r) => r.status === 'PENDING')).toBe(true);
    expect(recips.every((r) => r.tenantId === C1)).toBe(true);

    const status = await svc.status(C1, res.jobId);
    expect(status).toMatchObject({ total: 2, pending: 2, sent: 0, skipped: 0, failed: 0 });
  });

  it('aggregates recipient statuses in status()', async () => {
    const res = await svc.enqueue(C1, {
      channel: 'SMS',
      body: 'x',
      recipients: ['+15552000001', '+15552000002', '+15552000003'],
    });
    jobIds.push(res.jobId);
    // Simulate the worker having drained two of them.
    const rows = await db.admin.messageBulkRecipient.findMany({
      where: { jobId: res.jobId },
      orderBy: { toAddr: 'asc' },
    });
    const [first, second] = rows;
    if (!first || !second) throw new Error('expected 3 recipients');
    await db.admin.messageBulkRecipient.update({
      where: { id: first.id },
      data: { status: 'SENT' },
    });
    await db.admin.messageBulkRecipient.update({
      where: { id: second.id },
      data: { status: 'SKIPPED', reason: 'opted out' },
    });
    const status = await svc.status(C1, res.jobId);
    expect(status).toMatchObject({ total: 3, pending: 1, sent: 1, skipped: 1, failed: 0 });
  });

  it('does not leak a bulk job across tenants (RLS)', async () => {
    const res = await svc.enqueue(R1, {
      channel: 'SMS',
      body: 'parent only',
      recipients: ['+15553000001'],
    });
    jobIds.push(res.jobId);
    // C1 (a child of R1) must not read R1's job via the tenant-scoped read.
    expect(await svc.status(C1, res.jobId)).toBeNull();
  });

  it('requires a template or a body (schema)', async () => {
    await expect(svc.enqueue(C1, { channel: 'SMS', recipients: ['+1'] })).rejects.toThrow();
  });
});
