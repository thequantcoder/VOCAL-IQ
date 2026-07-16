import { Provider } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WhatsAppCallCostService, whatsappCallPeriod } from './whatsapp-call-cost.service';

/**
 * WhatsApp call cost metering (WAC-06) against real Postgres + RLS. One dedicated tenant per scenario
 * so the monthly-volume accrual (keyed by tenant+period) can't cross-contaminate the tier assertions.
 */
const db = new PrismaService();
const svc = new WhatsAppCallCostService(db);
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T_IN = '00000000-0000-0000-0000-0000ff21a0a1';
const T_OUT = '00000000-0000-0000-0000-0000ff21a0b1';
const T_SIB = '00000000-0000-0000-0000-0000ff21a0b2';
const T_IDEM = '00000000-0000-0000-0000-0000ff21a0c1';
const T_TIER = '00000000-0000-0000-0000-0000ff21a0d1';
const ALL = [T_IN, T_OUT, T_SIB, T_IDEM, T_TIER];

beforeAll(async () => {
  for (const id of ALL) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac6-${id.slice(-4)}`,
        slug: `wac6-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: ALL } } }); // cascades WhatsAppCall + usage + volume
});

/** Insert a terminated WhatsApp call ready to meter (bypasses RLS for setup). */
async function seedCall(
  tenantId: string,
  waCallId: string,
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED',
  durationSec: number,
  toNumber?: string,
) {
  await db.admin.whatsAppCall.create({
    data: {
      tenantId,
      waCallId,
      direction,
      status: 'completed',
      durationSec,
      ...(toNumber ? { toNumber } : {}),
    },
  });
}

const waUsage = (tenantId: string) =>
  db.admin.usageRecord.findMany({
    where: { tenantId, provider: Provider.WHATSAPP },
    orderBy: { ts: 'desc' },
  });

describe('WhatsAppCallCostService', () => {
  it('logs an inbound call at $0 (free) but still writes a UsageRecord', async () => {
    await seedCall(T_IN, 'wacid.in1', 'USER_INITIATED', 100, '+14155550100');
    await svc.meterTerminated(T_IN, 'wacid.in1');

    const usage = await waUsage(T_IN);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costUsd).toBe(0);
    expect(usage[0]?.units).toBe(100);
    expect(usage[0]?.capability).toBe('telephony');

    const row = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T_IN, waCallId: 'wacid.in1' },
      select: { billedAt: true, costUsd: true, billedCountry: true },
    });
    expect(row?.billedAt).not.toBeNull();
    expect(row?.costUsd).toBe(0);
    expect(row?.billedCountry).toBeNull(); // inbound never rate-cards a country

    // Inbound must NOT accrue outbound volume.
    const vol = await db.admin.whatsAppCallVolume.findMany({ where: { tenantId: T_IN } });
    expect(vol).toHaveLength(0);
  });

  it('meters an outbound call in 6-s pulses at the destination rate and accrues monthly volume', async () => {
    // 56 s → 10 pulses → 60 billed s → 1 min × US tier0 $0.010 = $0.01
    await seedCall(T_OUT, 'wacid.out1', 'BUSINESS_INITIATED', 56, '+14155550111');
    await svc.meterTerminated(T_OUT, 'wacid.out1');

    const usage = await waUsage(T_OUT);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costUsd).toBeCloseTo(0.01, 6);

    const row = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T_OUT, waCallId: 'wacid.out1' },
      select: { costUsd: true, billedCountry: true },
    });
    expect(row?.costUsd).toBeCloseTo(0.01, 6);
    expect(row?.billedCountry).toBe('US');

    const vol = await db.admin.whatsAppCallVolume.findUnique({
      where: { tenantId_period: { tenantId: T_OUT, period: whatsappCallPeriod() } },
      select: { billedSeconds: true },
    });
    expect(vol?.billedSeconds).toBe(60); // 10 pulses × 6 s

    // A sibling tenant sees none of it under RLS (tenant isolation).
    const siblingCalls = await db.withTenant(T_SIB, (tx) => tx.whatsAppCall.findMany());
    const siblingVol = await db.withTenant(T_SIB, (tx) => tx.whatsAppCallVolume.findMany());
    expect(siblingCalls).toHaveLength(0);
    expect(siblingVol).toHaveLength(0);
  });

  it('never double-meters a replayed Terminate (idempotent by billedAt)', async () => {
    await seedCall(T_IDEM, 'wacid.idem1', 'BUSINESS_INITIATED', 30, '+14155550122');
    await svc.meterTerminated(T_IDEM, 'wacid.idem1');
    await svc.meterTerminated(T_IDEM, 'wacid.idem1'); // replay

    const usage = await waUsage(T_IDEM);
    expect(usage).toHaveLength(1); // exactly one, not two
    expect(usage[0]?.costUsd).toBeCloseTo(0.005, 6); // 30 billed s = 0.5 min × $0.010

    const vol = await db.admin.whatsAppCallVolume.findUnique({
      where: { tenantId_period: { tenantId: T_IDEM, period: whatsappCallPeriod() } },
      select: { billedSeconds: true },
    });
    expect(vol?.billedSeconds).toBe(30); // accrued once, not twice
  });

  it('uses the lower (tier1) rate once monthly volume has crossed the band', async () => {
    // Seed this month past the 50,000-minute band (3,000,000 billed s) so the next call is tier1.
    await db.admin.whatsAppCallVolume.create({
      data: { tenantId: T_TIER, period: whatsappCallPeriod(), billedSeconds: 3_000_060 },
    });
    // 60 s → 10 pulses → 1 min × US tier1 $0.008 = $0.008
    await seedCall(T_TIER, 'wacid.tier1', 'BUSINESS_INITIATED', 60, '+14155550133');
    await svc.meterTerminated(T_TIER, 'wacid.tier1');

    const usage = await waUsage(T_TIER);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.costUsd).toBeCloseTo(0.008, 6);
  });
});
