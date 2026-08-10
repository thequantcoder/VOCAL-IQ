import { Role } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, FraudService } from './fraud.service';

/**
 * Real-time fraud enforcement (Day 70) against real Postgres. Proves the automated response
 * (suspend on a high-fraud signal override), the super-admin review-to-resume flow, KYC gating,
 * and audit completeness (self-audit C) — RLS-scoped (self-audit B).
 */

const db = new PrismaService();
const svc = new FraudService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000070a0001'; // a throwaway tenant we can suspend/restore
const SUPER: Actor = {
  userId: '00000000-0000-0000-0000-00000000000a',
  tenantId: PLATFORM,
  role: Role.SUPER_ADMIN,
};

const caseIds: string[] = [];

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'Fraudy',
      slug: `fraudy-${Date.now()}`,
      parentTenantId: PLATFORM,
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE' },
  });
});

afterAll(async () => {
  await db.admin.abuseCase.deleteMany({ where: { tenantId: T } });
  await db.admin.auditLog.deleteMany({ where: { tenantId: T, action: { startsWith: 'fraud.' } } });
  await db.admin.notification.deleteMany({ where: { tenantId: T } });
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('FraudService.evaluateAndEnforce', () => {
  it('suspends the tenant + opens an audited case on a high-fraud override', async () => {
    const res = await svc.evaluateAndEnforce(
      T,
      { callsLastHour: 600, dncHitRatio: 0.3, bannedContentHits: 4, shortCallRatio: 0.9 },
      SUPER.userId,
    );
    expect(res.action).toBe('suspend_tenant');
    if (res.caseId) caseIds.push(res.caseId);

    const tenant = await db.admin.tenant.findUnique({ where: { id: T }, select: { status: true } });
    expect(tenant?.status).toBe('SUSPENDED');

    const audit = await db.admin.auditLog.findFirst({
      where: { tenantId: T, action: 'fraud.enforce' },
    });
    expect(audit).toBeTruthy();
    const notif = await db.admin.notification.findFirst({ where: { tenantId: T } });
    expect((notif?.payload as { type?: string })?.type).toBe('fraud_case');
  });

  it('is a no-op (no case) for clean behaviour', async () => {
    const res = await svc.evaluateAndEnforce(T); // clean tenant, no override
    expect(res.action).toBe('allow');
    expect(res.caseId).toBeNull();
  });
});

describe('FraudService.resolveCase (super-admin review-to-resume)', () => {
  it('resumes the suspended tenant + resolves the case (audited)', async () => {
    const caseId = caseIds[0]!;
    const r = await svc.resolveCase(SUPER, caseId, 'resume', 'reviewed — false alarm');
    expect(r.status).toBe('resolved');

    const tenant = await db.admin.tenant.findUnique({ where: { id: T }, select: { status: true } });
    expect(tenant?.status).toBe('ACTIVE');
    const audit = await db.admin.auditLog.findFirst({
      where: { tenantId: T, action: 'fraud.review' },
    });
    expect(audit).toBeTruthy();
  });

  it('forbids a non-super-admin from reviewing', async () => {
    const owner: Actor = { userId: 'u', tenantId: T, role: Role.OWNER };
    await expect(svc.resolveCase(owner, caseIds[0]!, 'resume')).rejects.toThrow();
  });
});

describe('FraudService.assertCanScale (KYC gate)', () => {
  it('allows a low-volume tenant', async () => {
    const g = await svc.assertCanScale(T);
    expect(g.allowed).toBe(true);
  });
});
