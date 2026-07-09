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
  // Phase-6 advanced-feature entitlements per tier (Day 94). Mirrors PLAN_FEATURE_DEFAULTS in
  // @vocaliq/shared (inlined so the seed stays dependency-free). Pro unlocks the lighter advanced
  // features; Scale unlocks everything incl. the heavy/sensitive ones (video avatars, voice biometrics).
  const proFeatures = {
    conversationIntel: true,
    learnFromCalls: true,
    liveCopilot: true,
    extraChannels: true,
    workflowAutomation: true,
    voiceAnalyticsApi: true,
    multiAgentBenchmarking: true,
    translation: true,
  };
  const scaleFeatures = {
    ...proFeatures,
    developerApps: true,
    marketplace: true,
    videoAvatar: true,
    voiceBiometrics: true,
  };
  const plans = [
    { id: ID.planFree, name: 'Free', priceMonthly: 0, includedMinutes: 30, agentLimit: 1, numberLimit: 0, sipLimit: 0, overageRatePerMin: 25, features: {} },
    { id: ID.planPro, name: 'Pro', priceMonthly: 9900, includedMinutes: 1000, agentLimit: 10, numberLimit: 3, sipLimit: 1, overageRatePerMin: 12, features: proFeatures },
    { id: ID.planScale, name: 'Scale', priceMonthly: 49900, includedMinutes: 6000, agentLimit: 50, numberLimit: 25, sipLimit: 10, overageRatePerMin: 8, features: scaleFeatures },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      create: { ...p, currency: 'USD' },
      update: { ...p, currency: 'USD' },
    });
  }

  // Public preset voices (tenantId = null → visible to all via RLS). Fixed ids so
  // re-seeding is idempotent (Day 26). ElevenLabs stock voices, all approved + non-cloned.
  const presets = [
    { vid: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male', age: 'middle-aged', accent: 'american', style: 'conversational' },
    { vid: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', age: 'young', accent: 'american', style: 'professional' },
    { vid: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', age: 'young', accent: 'american', style: 'upbeat' },
    { vid: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', age: 'middle-aged', accent: 'australian', style: 'casual' },
    { vid: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male', age: 'middle-aged', accent: 'british', style: 'warm' },
    { vid: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', age: 'young', accent: 'swedish', style: 'seductive' },
    { vid: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male', age: 'old', accent: 'american', style: 'trustworthy' },
    { vid: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', age: 'young', accent: 'american', style: 'expressive' },
  ];
  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    const id = `00000000-0000-0000-0000-0000000001${(i + 16).toString(16).padStart(2, '0')}`;
    await prisma.voice.upsert({
      where: { id },
      create: {
        id,
        tenantId: null,
        provider: 'ELEVENLABS',
        providerVoiceId: p.vid,
        name: p.name,
        language: 'en',
        gender: p.gender,
        age: p.age,
        accent: p.accent,
        style: p.style,
        isCloned: false,
        approved: true,
      },
      update: { name: p.name, gender: p.gender, age: p.age, accent: p.accent, style: p.style },
    });
  }

  console.log('[seed] platform/reseller/customer + super-admin + plans + preset voices ready.');
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
