import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { EntitlementsService } from './entitlements.service';

/**
 * Phase-6 advanced-feature entitlements (Day 94) — real Postgres, RLS-scoped. Proves that a Free
 * tenant gets no advanced features, Pro gets the light set (translation) but not the heavy ones
 * (video avatars), and Scale gets everything — driven by the seeded plan tiers. `assertFeature`
 * throws a clear upgrade error when a plan doesn't include a feature (self-audit D — margin gate).
 */

const db = new PrismaService();
const svc = new EntitlementsService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const PLAN_PRO = '00000000-0000-0000-0000-000000000011';
const PLAN_SCALE = '00000000-0000-0000-0000-000000000012';
const T_FREE = '00000000-0000-0000-0000-0000094a0001';
const T_PRO = '00000000-0000-0000-0000-0000094a0002';
const T_SCALE = '00000000-0000-0000-0000-0000094a0003';

beforeAll(async () => {
  for (const id of [T_FREE, T_PRO, T_SCALE]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Ent ${id.slice(-4)}`,
        slug: `ent-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.subscription.create({
    data: { tenantId: T_PRO, planId: PLAN_PRO, status: 'ACTIVE' },
  });
  await db.admin.subscription.create({
    data: { tenantId: T_SCALE, planId: PLAN_SCALE, status: 'ACTIVE' },
  });
});

afterAll(async () => {
  await db.admin.subscription.deleteMany({ where: { tenantId: { in: [T_PRO, T_SCALE] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T_FREE, T_PRO, T_SCALE] } } });
});

describe('advanced-feature entitlements by tier', () => {
  it('Free: no advanced features', async () => {
    const ent = await svc.entitlements(T_FREE);
    expect(ent.planName).toBe('Free');
    expect(ent.advancedFeatures.translation).toBe(false);
    expect(ent.advancedFeatures.videoAvatar).toBe(false);
    expect(await svc.hasFeature(T_FREE, 'voiceBiometrics')).toBe(false);
  });

  it('Pro: light advanced features, not the heavy/sensitive ones', async () => {
    const ent = await svc.entitlements(T_PRO);
    expect(ent.planName).toBe('Pro');
    expect(ent.advancedFeatures.translation).toBe(true);
    expect(ent.advancedFeatures.liveCopilot).toBe(true);
    expect(ent.advancedFeatures.videoAvatar).toBe(false);
    expect(await svc.hasFeature(T_PRO, 'videoAvatar')).toBe(false);
  });

  it('Scale: everything, incl. video avatars + voice biometrics', async () => {
    const ent = await svc.entitlements(T_SCALE);
    expect(ent.planName).toBe('Scale');
    expect(Object.values(ent.advancedFeatures).every((v) => v === true)).toBe(true);
    expect(await svc.hasFeature(T_SCALE, 'videoAvatar')).toBe(true);
    expect(await svc.hasFeature(T_SCALE, 'voiceBiometrics')).toBe(true);
  });

  it('assertFeature throws an upgrade error only when not entitled', async () => {
    await expect(svc.assertFeature(T_FREE, 'videoAvatar')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'BILLING',
    );
    await expect(svc.assertFeature(T_SCALE, 'videoAvatar')).resolves.toBeUndefined();
  });
});
