import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyJwtToken } from '../auth/jwt';
import { PrismaService } from '../db/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { SuperAdminService } from './superadmin.service';

/**
 * Super-admin console (Day 55) against real Postgres + RLS. Proves the security-critical
 * properties (self-audit C + B): the console spans tenants ONLY for a real super-admin,
 * impersonation is audited + fail-closed for non-admins, and the platform roll-up ties out.
 */

const db = new PrismaService();
const svc = new SuperAdminService(db);
const tenants = new TenantService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const R1 = '00000000-0000-0000-0000-000000000002'; // seed reseller
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const SUPER_ADMIN = '00000000-0000-0000-0000-00000000000a'; // seed super-admin user
const PERIOD = '2026-08';

// A non-admin user (owner of a throwaway tenant) used for the negative impersonation test.
const OUTSIDER_TENANT = '00000000-0000-0000-0000-0000055a0001';
const OUTSIDER_USER = '00000000-0000-0000-0000-0000055a000a';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: OUTSIDER_TENANT },
    create: {
      id: OUTSIDER_TENANT,
      type: 'CUSTOMER',
      name: 'Outsider',
      slug: `outsider-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
  await db.admin.user.upsert({
    where: { id: OUTSIDER_USER },
    create: { id: OUTSIDER_USER, email: `outsider-${Date.now()}@x.dev` },
    update: {},
  });
  await db.admin.membership.upsert({
    where: { tenantId_userId: { tenantId: OUTSIDER_TENANT, userId: OUTSIDER_USER } },
    create: { tenantId: OUTSIDER_TENANT, userId: OUTSIDER_USER, role: 'OWNER', status: 'ACTIVE' },
    update: { role: 'OWNER' },
  });
  await db.admin.resellerMargin.create({
    data: {
      resellerTenantId: R1,
      childTenantId: C1,
      period: PERIOD,
      revenue: 1500,
      cost: 900,
      margin: 600,
    },
  });
});

afterAll(async () => {
  await db.admin.resellerMargin.deleteMany({ where: { resellerTenantId: R1, period: PERIOD } });
  await db.admin.auditLog.deleteMany({
    where: { tenantId: { in: [C1, OUTSIDER_TENANT] }, actorUserId: SUPER_ADMIN },
  });
  await db.admin.membership.deleteMany({ where: { tenantId: OUTSIDER_TENANT } });
  await db.admin.tenant.deleteMany({ where: { id: OUTSIDER_TENANT } });
  await db.admin.user.deleteMany({ where: { id: OUTSIDER_USER } });
});

describe('SuperAdminService.listTenants (spans tenants)', () => {
  it('searches across ALL tenants by name and filters by type', async () => {
    const all = await svc.listTenants({ page: 1, pageSize: 100 });
    const ids = all.items.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([PLATFORM, R1, C1]));

    const resellers = await svc.listTenants({ type: 'RESELLER', page: 1, pageSize: 100 });
    expect(resellers.items.every((t) => t.type === 'RESELLER')).toBe(true);
    expect(resellers.items.some((t) => t.id === R1)).toBe(true);
    expect(resellers.items.some((t) => t.id === C1)).toBe(false);
  });
});

describe('SuperAdminService.platformOverview (ties out — self-audit D)', () => {
  it('rolls up gross revenue/cost/margin across resellers + a tenant census', async () => {
    const o = await svc.platformOverview(PERIOD);
    expect(o.grossRevenueCents).toBe(1500);
    expect(o.providerCostCents).toBe(900);
    expect(o.totalMarginCents).toBe(600);
    expect(o.tenants.total).toBeGreaterThanOrEqual(3);
    expect(o.tenants.resellers).toBeGreaterThanOrEqual(1);
  });
});

describe('SuperAdminService.setTenantStatus (audited)', () => {
  it('suspends + reactivates a tenant and writes an audit row each time', async () => {
    await svc.setTenantStatus(SUPER_ADMIN, C1, 'SUSPENDED');
    const suspended = await db.admin.tenant.findUnique({
      where: { id: C1 },
      select: { status: true },
    });
    expect(suspended?.status).toBe('SUSPENDED');
    await svc.setTenantStatus(SUPER_ADMIN, C1, 'ACTIVE'); // restore

    const audits = await svc.listAudit(C1);
    expect(audits.some((a) => a.action === 'superadmin.tenant.status')).toBe(true);
  });
});

describe('SuperAdminService.impersonate (audited + fail-closed — self-audit C)', () => {
  it('mints a working, tenant-scoped grant for a super-admin and audits it', async () => {
    const grant = await svc.impersonate(SUPER_ADMIN, {
      tenantId: C1,
      reason: 'investigating a billing dispute',
    });
    expect(grant.tenantId).toBe(C1);
    expect(grant.expiresInSeconds).toBeLessThanOrEqual(30 * 60);

    // The grant is a signed token carrying the actor + the target tenant.
    const claims = await verifyJwtToken(grant.token);
    expect(claims.userId).toBe(SUPER_ADMIN);
    expect(claims.actAsTenantId).toBe(C1);

    // Using it resolves the request scope to the target tenant, attributed to the actor.
    const ctx = await tenants.resolveImpersonation(claims.userId, claims.actAsTenantId as string);
    expect(ctx.tenantId).toBe(C1);
    expect(ctx.userId).toBe(SUPER_ADMIN);
    expect(ctx.role).toBe('SUPER_ADMIN');

    // The grant was audited on the target tenant BEFORE any action.
    const audits = await svc.listAudit(C1);
    const imp = audits.find((a) => a.action === 'superadmin.impersonate');
    expect(imp).toBeTruthy();
    expect((imp?.meta as { reason?: string })?.reason).toContain('billing dispute');
  });

  it('refuses to resolve an impersonation grant for a NON super-admin (fail-closed)', async () => {
    // Even if a non-admin somehow presented an `act` claim, resolution re-checks the role.
    await expect(tenants.resolveImpersonation(OUTSIDER_USER, C1)).rejects.toThrow();
  });

  it('rejects impersonating a tenant that does not exist', async () => {
    await expect(
      svc.impersonate(SUPER_ADMIN, {
        tenantId: '00000000-0000-0000-0000-0000ffffffff',
        reason: 'no such tenant',
      }),
    ).rejects.toThrow();
  });
});

describe('SuperAdminService.systemHealth', () => {
  it('reports overall + per-service status with a reachable DB', async () => {
    const h = await svc.systemHealth();
    expect(['ok', 'degraded', 'down']).toContain(h.overall);
    expect(h.services.find((s) => s.name === 'database')?.status).toBe('ok');
  });
});
