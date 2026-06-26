import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from './tenant.service';

/**
 * RBAC + tenant-isolation integration (real Postgres). Builds two sibling reseller
 * subtrees under the seeded platform, then proves: tenant resolution honours
 * membership; a user can't resolve a tenant they don't belong to; and — the
 * "try to break it" case — RLS blocks cross-tenant + unscoped app queries.
 */
const db = new PrismaService();
const tenants = new TenantService(db);

// Seeded ids (always present after `prisma db seed`).
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const R1 = '00000000-0000-0000-0000-000000000002'; // reseller
const C1 = '00000000-0000-0000-0000-000000000003'; // customer under R1
// Created here:
const R2 = '00000000-0000-0000-0000-0000000d0001';
const C2 = '00000000-0000-0000-0000-0000000d0002';
const U_OWNER_C1 = '00000000-0000-0000-0000-0000000e0001';
const U_ANALYST_C1 = '00000000-0000-0000-0000-0000000e0002';
const U_ADMIN_R1 = '00000000-0000-0000-0000-0000000e0003';
const U_NOBODY = '00000000-0000-0000-0000-0000000e0004';
const CONTACT_C1 = '00000000-0000-0000-0000-0000000f0001';
const CONTACT_C2 = '00000000-0000-0000-0000-0000000f0002';

beforeAll(async () => {
  const a = db.admin;
  await a.tenant.upsert({
    where: { id: R2 },
    create: {
      id: R2,
      type: 'RESELLER',
      parentTenantId: PLATFORM,
      name: 'RBAC R2',
      slug: 'rbac-r2',
      status: 'ACTIVE',
    },
    update: {},
  });
  await a.tenant.upsert({
    where: { id: C2 },
    create: {
      id: C2,
      type: 'CUSTOMER',
      parentTenantId: R2,
      name: 'RBAC C2',
      slug: 'rbac-c2',
      status: 'ACTIVE',
    },
    update: {},
  });
  const users: [string, string][] = [
    [U_OWNER_C1, 'owner-c1'],
    [U_ANALYST_C1, 'analyst-c1'],
    [U_ADMIN_R1, 'admin-r1'],
    [U_NOBODY, 'nobody'],
  ];
  for (const [id, slug] of users) {
    await a.user.upsert({
      where: { id },
      create: { id, email: `${slug}@rbac.test`, authProviderId: `rbac_${slug}` },
      update: {},
    });
  }
  const memberships: [string, string, 'OWNER' | 'ANALYST' | 'RESELLER_ADMIN'][] = [
    [U_OWNER_C1, C1, 'OWNER'],
    [U_ANALYST_C1, C1, 'ANALYST'],
    [U_ADMIN_R1, R1, 'RESELLER_ADMIN'],
  ];
  for (const [userId, tenantId, role] of memberships) {
    await a.membership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, role },
      update: { role },
    });
  }
  await a.contact.upsert({
    where: { id: CONTACT_C1 },
    create: { id: CONTACT_C1, tenantId: C1, name: 'Contact in C1' },
    update: {},
  });
  await a.contact.upsert({
    where: { id: CONTACT_C2 },
    create: { id: CONTACT_C2, tenantId: C2, name: 'Contact in C2' },
    update: {},
  });
});

afterAll(() => db.onModuleDestroy());

describe('TenantService.resolveContext', () => {
  it('resolves a member to their tenant + role', async () => {
    expect(await tenants.resolveContext(U_OWNER_C1)).toMatchObject({ tenantId: C1, role: 'OWNER' });
    expect(await tenants.resolveContext(U_ADMIN_R1)).toMatchObject({
      tenantId: R1,
      role: 'RESELLER_ADMIN',
    });
  });

  it('rejects resolving a tenant the user is not a member of (403)', async () => {
    try {
      await tenants.resolveContext(U_OWNER_C1, C2);
      throw new Error('expected rejection');
    } catch (e) {
      expect(isAppError(e) && e.status === 403).toBe(true);
    }
  });

  it('rejects a user with no membership (TenantError 403)', async () => {
    await expect(tenants.resolveContext(U_NOBODY)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'TENANT',
    );
  });
});

describe('RLS isolation via withTenant (front door + safety net)', () => {
  it('customer C1 sees only its own contacts, never a sibling subtree (C2)', async () => {
    const rows = await db.withTenant(C1, (tx) => tx.contact.findMany());
    expect(rows.some((c) => c.tenantId === C1)).toBe(true);
    expect(rows.some((c) => c.tenantId === C2)).toBe(false);
  });

  it('reseller R1 sees its child C1 data but NOT sibling reseller R2/C2 data', async () => {
    const rows = await db.withTenant(R1, (tx) => tx.contact.findMany());
    expect(rows.some((c) => c.tenantId === C1)).toBe(true);
    expect(rows.some((c) => c.tenantId === C2)).toBe(false);
  });

  it('a DELIBERATELY unscoped app query still returns zero rows (RLS safety net)', async () => {
    // No withTenant → no app.current_tenant → RLS denies everything for the app role.
    // (Only meaningful against the non-superuser role; superuser would bypass RLS.)
    if (!(process.env.APP_DATABASE_URL ?? '').includes('vocaliq_app')) return;
    const rows = await db.app.contact.findMany();
    expect(rows).toHaveLength(0);
  });
});
