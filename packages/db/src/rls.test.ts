import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant } from './index';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

/**
 * Cross-tenant isolation — the most important test in the codebase. Builds two
 * reseller subtrees with the OWNER client (bypasses RLS), then proves the
 * RLS-constrained app role (`withTenant`) sees only its own subtree. The fuller
 * suite lands Day 5; this is the Day-4 scaffold per the build order.
 *
 * Requires the app role: APP_DATABASE_URL must be a non-superuser connection.
 */
const owner = createPrismaClient(process.env.DATABASE_URL);
const app = createPrismaClient(process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL);

// Distinct from the seed ids so this test is self-contained + idempotent.
const R1 = '00000000-0000-0000-0000-0000000aa001';
const C1 = '00000000-0000-0000-0000-0000000aa002';
const R2 = '00000000-0000-0000-0000-0000000bb001';
const C2 = '00000000-0000-0000-0000-0000000bb002';
const PLATFORM = '00000000-0000-0000-0000-000000000001';

async function seedTree(): Promise<void> {
  // Two sibling resellers under platform, each with one customer + one contact.
  for (const [id, type, parent, slug] of [
    [R1, 'RESELLER', PLATFORM, 'rls-r1'],
    [C1, 'CUSTOMER', R1, 'rls-c1'],
    [R2, 'RESELLER', PLATFORM, 'rls-r2'],
    [C2, 'CUSTOMER', R2, 'rls-c2'],
  ] as const) {
    await owner.tenant.upsert({
      where: { id },
      create: { id, type, parentTenantId: parent, name: slug, slug, status: 'ACTIVE' },
      update: {},
    });
  }
  await owner.contact.upsert({
    where: { id: '00000000-0000-0000-0000-0000000aa0c1' },
    create: { id: '00000000-0000-0000-0000-0000000aa0c1', tenantId: C1, name: 'Alice in C1' },
    update: {},
  });
  await owner.contact.upsert({
    where: { id: '00000000-0000-0000-0000-0000000bb0c2' },
    create: { id: '00000000-0000-0000-0000-0000000bb0c2', tenantId: C2, name: 'Bob in C2' },
    update: {},
  });
}

// Deny-by-default only bites a non-superuser role; superuser bypasses RLS entirely.
const appRoleActive = (process.env.APP_DATABASE_URL ?? '').includes('vocaliq_app');

beforeAll(seedTree);
afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('RLS cross-tenant isolation', () => {
  it('a customer sees only its own contacts (not a sibling subtree)', async () => {
    const c1Contacts = await withTenant(C1, (tx) => tx.contact.findMany(), app);
    expect(c1Contacts.every((c) => c.tenantId === C1)).toBe(true);
    expect(c1Contacts.some((c) => c.name === 'Bob in C2')).toBe(false);
  });

  it('reseller R1 sees its child C1 but NOT sibling reseller R2 or its customer', async () => {
    const visible = await withTenant(R1, (tx) => tx.tenant.findMany(), app);
    const ids = visible.map((t) => t.id);
    expect(ids).toContain(R1);
    expect(ids).toContain(C1);
    expect(ids).not.toContain(R2);
    expect(ids).not.toContain(C2);
  });

  it('reseller R1 sees C1 contacts but not C2 contacts (subtree data isolation)', async () => {
    const contacts = await withTenant(R1, (tx) => tx.contact.findMany(), app);
    expect(contacts.some((c) => c.tenantId === C1)).toBe(true);
    expect(contacts.some((c) => c.tenantId === C2)).toBe(false);
  });

  it('with no tenant context set, the app role sees zero rows (deny-by-default)', async () => {
    // Only meaningful against the non-superuser app role (superuser bypasses RLS).
    if (!appRoleActive) return;
    const rows = await app.contact.findMany();
    expect(rows).toHaveLength(0);
  });
});
