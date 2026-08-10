import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ResellerService } from './reseller.service';

/**
 * Reseller hierarchy (Day 51) against real Postgres + RLS. Proves the CRITICAL property
 * (self-audit B): a reseller provisions + manages ONLY its own subtree — never a sibling
 * reseller's — plus suspend cascade. Uses the seed reseller R1 and a second reseller R2 that
 * this test creates at the platform level.
 */

const db = new PrismaService();
const svc = new ResellerService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const R1 = '00000000-0000-0000-0000-000000000002'; // seed RESELLER
const R2 = '00000000-0000-0000-0000-0000051a0002'; // a second reseller (this test)
const R2_CHILD = '00000000-0000-0000-0000-0000051a0003';

const createdTenants: string[] = [R2, R2_CHILD];
const createdEmails: string[] = [];

afterAll(async () => {
  await db.admin.membership.deleteMany({ where: { tenantId: { in: createdTenants } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: createdTenants } } });
  await db.admin.user.deleteMany({ where: { email: { in: createdEmails } } });
});

async function seedSecondReseller() {
  await db.admin.tenant.upsert({
    where: { id: R2 },
    create: {
      id: R2,
      type: 'RESELLER',
      name: 'Rival Reseller',
      slug: `rival-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
  await db.admin.tenant.upsert({
    where: { id: R2_CHILD },
    create: {
      id: R2_CHILD,
      type: 'CUSTOMER',
      name: 'Rival Customer',
      slug: `rivalcust-${Date.now()}`,
      parentTenantId: R2,
    },
    update: {},
  });
}

describe('ResellerService provisioning', () => {
  it('creates a sub-tenant under the reseller with an OWNER membership', async () => {
    const email = `owner-${Date.now()}@acme.co`;
    createdEmails.push(email);
    const sub = await svc.createSubTenant(R1, {
      name: 'Acme Co',
      ownerEmail: email,
      status: 'ACTIVE',
    });
    createdTenants.push(sub.id);

    expect(sub.parentTenantId).toBe(R1);
    expect(sub.type).toBe('CUSTOMER');
    expect((await svc.listSubTenants(R1)).some((t) => t.id === sub.id)).toBe(true);

    const membership = await db.admin.membership.findFirst({
      where: { tenantId: sub.id, role: 'OWNER' },
      select: { id: true },
    });
    expect(membership).not.toBeNull();
  });
});

describe('subtree isolation (self-audit B — critical)', () => {
  it("a reseller can never see, read, or suspend another reseller's sub-tenant", async () => {
    await seedSecondReseller();

    // R1 lists only ITS children — never R2's customer.
    expect((await svc.listSubTenants(R1)).some((t) => t.id === R2_CHILD)).toBe(false);
    // R1 cannot read R2's customer (RLS hides it → NotFound).
    await expect(svc.getSubTenant(R1, R2_CHILD)).rejects.toThrow(/not found/i);
    // R1 cannot suspend R2's customer.
    await expect(svc.setStatus(R1, R2_CHILD, 'SUSPENDED')).rejects.toThrow(/not found/i);

    // And R2's customer is untouched.
    const still = await db.admin.tenant.findUnique({
      where: { id: R2_CHILD },
      select: { status: true },
    });
    expect(still?.status).not.toBe('SUSPENDED');
  });

  it('a reseller cannot suspend itself', async () => {
    await expect(svc.setStatus(R1, R1, 'SUSPENDED')).rejects.toThrow(/own status/i);
  });
});

describe('suspend cascade', () => {
  it('suspending a sub-tenant cascades to its descendants', async () => {
    const email = `owner-casc-${Date.now()}@acme.co`;
    createdEmails.push(email);
    const parent = await svc.createSubTenant(R1, {
      name: 'Parent Co',
      ownerEmail: email,
      status: 'ACTIVE',
    });
    createdTenants.push(parent.id);

    // A grandchild under the sub-tenant (a sub-reseller scenario).
    const grandchild = await db.admin.tenant.create({
      data: {
        type: 'CUSTOMER',
        name: 'Grandchild',
        slug: `gc-${Date.now()}`,
        parentTenantId: parent.id,
      },
      select: { id: true },
    });
    createdTenants.push(grandchild.id);

    const res = await svc.setStatus(R1, parent.id, 'SUSPENDED');
    expect(res.affected).toBe(2); // parent + grandchild

    const gc = await db.admin.tenant.findUnique({
      where: { id: grandchild.id },
      select: { status: true },
    });
    expect(gc?.status).toBe('SUSPENDED');

    // Reactivate cascades back.
    await svc.setStatus(R1, parent.id, 'ACTIVE');
    const gc2 = await db.admin.tenant.findUnique({
      where: { id: grandchild.id },
      select: { status: true },
    });
    expect(gc2?.status).toBe('ACTIVE');
  });
});
