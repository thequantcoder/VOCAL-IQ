import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { AgentsService } from './agents.service';

/** Agent CRUD (real Postgres, RLS-scoped) — Day 14 dashboard backing. */

const db = new PrismaService();
const svc = new AgentsService(db, new EntitlementsService(db));
const C1 = '00000000-0000-0000-0000-000000000003';
const PLAN_SCALE = '00000000-0000-0000-0000-000000000012';
const SUB_ID = '00000000-0000-0000-0000-0000004a0001';
const createdIds: string[] = [];

beforeAll(async () => {
  // Subscribe C1 to Scale so the Day-15 agent-limit gate has headroom regardless of
  // agents other (parallel) suites create in this shared tenant.
  await db.admin.subscription.upsert({
    where: { id: SUB_ID },
    create: { id: SUB_ID, tenantId: C1, planId: PLAN_SCALE, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_SCALE },
  });
});

afterAll(async () => {
  await db.admin.agent.deleteMany({ where: { id: { in: createdIds } } });
  await db.admin.subscription.deleteMany({ where: { id: SUB_ID } });
});

describe('AgentsService', () => {
  it('creates, lists, gets, and updates an agent (RLS-scoped)', async () => {
    const created = await svc.create(C1, {
      name: 'Front Desk',
      systemPrompt: 'You are the receptionist.',
      type: 'INBOUND',
      languages: ['en'],
      turnTimeoutMs: 900,
    });
    createdIds.push(created.id);
    expect(created.name).toBe('Front Desk');
    expect((created.persona as { systemPrompt: string }).systemPrompt).toBe(
      'You are the receptionist.',
    );
    expect(created.status).toBe('DRAFT');

    const list = await svc.list(C1);
    expect(list.some((a) => a.id === created.id)).toBe(true);

    const got = await svc.get(C1, created.id);
    expect(got.turnTimeoutMs).toBe(900);

    const updated = await svc.update(C1, created.id, {
      name: 'Front Desk v2',
      status: 'PUBLISHED',
    });
    expect(updated.name).toBe('Front Desk v2');
    expect(updated.status).toBe('PUBLISHED');
  });

  it('rejects an empty name', async () => {
    await expect(svc.create(C1, { name: '' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('404s an unknown agent', async () => {
    await expect(svc.get(C1, '00000000-0000-0000-0000-0000009b9999')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});
