import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

import { PrismaClient } from '@prisma/client';

/**
 * Seed a realistic tenant tree so later days have data to work with:
 * PLATFORM → demo RESELLER → demo CUSTOMER, a SUPER_ADMIN user with memberships,
 * and the Free/Pro/Scale plan ladder (USD). Idempotent: fixed UUIDs + upserts, so
 * re-running is safe. Runs as the OWNER role (DATABASE_URL) which bypasses RLS.
 */

// Stable ids → idempotent upserts.
const ID = {
  platform: '00000000-0000-0000-0000-000000000001',
  reseller: '00000000-0000-0000-0000-000000000002',
  customer: '00000000-0000-0000-0000-000000000003',
  superAdmin: '00000000-0000-0000-0000-00000000000a',
  planFree: '00000000-0000-0000-0000-000000000010',
  planPro: '00000000-0000-0000-0000-000000000011',
  planScale: '00000000-0000-0000-0000-000000000012',
} as const;

// Seed/admin operations use the owner role explicitly.
const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? { datasources: { db: { url: process.env.DATABASE_URL } } }
    : undefined,
);

async function main(): Promise<void> {
  // Tenant hierarchy.
  await prisma.tenant.upsert({
    where: { id: ID.platform },
    create: { id: ID.platform, type: 'PLATFORM', name: 'VocalIQ Platform', slug: 'platform', status: 'ACTIVE' },
    update: { name: 'VocalIQ Platform', status: 'ACTIVE' },
  });
  await prisma.tenant.upsert({
    where: { id: ID.reseller },
    create: { id: ID.reseller, type: 'RESELLER', name: 'Demo Reseller', slug: 'demo-reseller', status: 'ACTIVE', parentTenantId: ID.platform },
    update: { parentTenantId: ID.platform, status: 'ACTIVE' },
  });
  await prisma.tenant.upsert({
    where: { id: ID.customer },
    create: { id: ID.customer, type: 'CUSTOMER', name: 'Demo Customer', slug: 'demo-customer', status: 'TRIAL', parentTenantId: ID.reseller },
    update: { parentTenantId: ID.reseller },
  });

  // Super-admin user + membership on the platform tenant.
  await prisma.user.upsert({
    where: { id: ID.superAdmin },
    create: {
      id: ID.superAdmin,
      email: 'admin@vocaliq.dev',
      name: 'Platform Super Admin',
      authProviderId: 'seed_super_admin',
    },
    update: { email: 'admin@vocaliq.dev' },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: ID.platform, userId: ID.superAdmin } },
    create: { tenantId: ID.platform, userId: ID.superAdmin, role: 'SUPER_ADMIN' },
    update: { role: 'SUPER_ADMIN' },
  });

  // Plan ladder — global plans (tenantId null), base currency USD. Prices/limits
  // are minor-unit + editable later (the no-code plan builder is Day 56).
  const plans = [
    { id: ID.planFree, name: 'Free', priceMonthly: 0, includedMinutes: 30, agentLimit: 1, numberLimit: 0, sipLimit: 0, overageRatePerMin: 25 },
    { id: ID.planPro, name: 'Pro', priceMonthly: 9900, includedMinutes: 1000, agentLimit: 10, numberLimit: 3, sipLimit: 1, overageRatePerMin: 12 },
    { id: ID.planScale, name: 'Scale', priceMonthly: 49900, includedMinutes: 6000, agentLimit: 50, numberLimit: 25, sipLimit: 10, overageRatePerMin: 8 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      create: { ...p, currency: 'USD' },
      update: { ...p, currency: 'USD' },
    });
  }

  console.log('[seed] platform/reseller/customer + super-admin + Free/Pro/Scale plans ready.');
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
