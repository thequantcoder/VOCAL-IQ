import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { CallbacksService } from './callbacks.service';

/**
 * Caller-requested callbacks (Day 80) — real Postgres, RLS-scoped. Proves create/list/cancel, the
 * cancel state guard, and the CRITICAL cross-tenant isolation (self-audit B).
 */

const db = new PrismaService();
const svc = new CallbacksService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000080a0001';
const T2 = '00000000-0000-0000-0000-0000080a0002';

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Callback ${id.slice(-4)}`,
        slug: `callback-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
});

afterAll(async () => {
  await db.admin.callback.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('CallbacksService', () => {
  it('schedules, lists, gets, and cancels a callback', async () => {
    const created = await svc.create(T, {
      phone: '+15551234567',
      requestedAt: '2026-07-02T15:00:00Z',
      timezone: 'America/New_York',
      note: 'Prefers afternoons',
    });
    expect(created.status).toBe('scheduled');
    expect(created.timezone).toBe('America/New_York');

    const list = await svc.list(T);
    expect(list.some((c) => c.id === created.id)).toBe(true);
    expect((await svc.list(T, 'scheduled')).some((c) => c.id === created.id)).toBe(true);

    const cancelled = await svc.cancel(T, created.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('rejects an invalid request and refuses to cancel a non-scheduled callback', async () => {
    await expect(svc.create(T, { phone: '1', requestedAt: 'nope' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    const c = await svc.create(T, { phone: '+15550000000', requestedAt: '2026-07-02T15:00:00Z' });
    await svc.cancel(T, c.id);
    await expect(svc.cancel(T, c.id)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('404s an unknown callback', async () => {
    await expect(svc.get(T, '00000000-0000-0000-0000-0000080affff')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});

describe('CallbacksService tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant can never read, list, or cancel another tenant’s callback', async () => {
    const c = await svc.create(T, { phone: '+15559998888', requestedAt: '2026-07-03T18:00:00Z' });

    await expect(svc.get(T2, c.id)).rejects.toThrow(/not found/i);
    expect(await svc.list(T2)).toEqual([]);
    await expect(svc.cancel(T2, c.id)).rejects.toThrow(/not found/i);

    // T's callback is untouched.
    expect((await svc.get(T, c.id)).status).toBe('scheduled');
  });
});
