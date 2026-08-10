import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { SipService } from './sip.service';

/**
 * BYO-SIP trunk (Day 35), against real Postgres (RLS-scoped). A dedicated tenant on the Pro
 * plan (sipLimit 1) so the per-plan limit is tested deterministically without racing other
 * suites' subscriptions. Proves: create from template, plan limit, creds NEVER exposed, RLS.
 */

const db = new PrismaService();
const svc = new SipService(db, new EntitlementsService(db));
const C1 = '00000000-0000-0000-0000-000000000003';
const PLAN_PRO = '00000000-0000-0000-0000-000000000011';
// Isolated tenant for this suite.
const T = '00000000-0000-0000-0000-0000009e0001';
const SUB = '00000000-0000-0000-0000-0000009e0002';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: { id: T, type: 'CUSTOMER', name: 'SIP Test Co', slug: `sip-test-${T.slice(-6)}` },
    update: {},
  });
  await db.admin.subscription.upsert({
    where: { id: SUB },
    create: { id: SUB, tenantId: T, planId: PLAN_PRO, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_PRO },
  });
});

afterAll(async () => {
  await db.admin.subscription.deleteMany({ where: { id: SUB } });
  await db.admin.sipTrunk.deleteMany({ where: { tenantId: T } });
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

const trunkInput = {
  providerTemplate: 'telnyx',
  name: 'Primary trunk',
  inbound: true,
  outbound: true,
  concurrencyLimit: 20,
  credentials: { authUsername: 'acct_secret_123', authPassword: 'p@ssw0rd!' },
};

describe('SipService', () => {
  it('creates a trunk from a template and NEVER exposes credentials', async () => {
    const trunk = await svc.create(T, trunkInput);
    expect(trunk.providerTemplate).toBe('telnyx');
    expect(trunk.host).toBe('sip.telnyx.com'); // template default filled
    expect(trunk.transport).toBe('TLS');
    expect(trunk.concurrencyLimit).toBe(20);
    // Credentials are masked / absent — no password or full username anywhere in the DTO.
    expect(trunk.hasCredentials).toBe(true);
    expect(trunk.authUsernameMasked).not.toContain('secret');
    const json = JSON.stringify(trunk);
    expect(json).not.toContain('p@ssw0rd!');
    expect(json).not.toContain('acct_secret_123');

    const list = await svc.list(T);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('p@ssw0rd!');
  });

  it('enforces the plan SIP-trunk limit (Pro = 1)', async () => {
    // One trunk already exists from the previous test → a second exceeds Pro's sipLimit.
    await expect(svc.create(T, { ...trunkInput, name: 'Second' })).rejects.toSatisfy(isAppError);
  });

  it('updates flags and is RLS-isolated from other tenants', async () => {
    const [trunk] = await svc.list(T);
    const updated = await svc.update(T, trunk!.id, { inbound: false, concurrencyLimit: 5 });
    expect(updated.inbound).toBe(false);
    expect(updated.concurrencyLimit).toBe(5);

    // Another tenant (C1) cannot see or fetch T's trunk.
    expect(await svc.list(C1)).not.toContainEqual(expect.objectContaining({ id: trunk!.id }));
    await expect(svc.get(C1, trunk!.id)).rejects.toSatisfy(isAppError);
  });
});
