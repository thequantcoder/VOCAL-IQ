import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessengerCallCostService } from './messenger-call-cost.service';

/**
 * MEC-06 cost metering against real Postgres + RLS. Messenger calling is free-tier, so every call logs a
 * $0 UsageRecord (never an unmetered path); the `billedAt` claim makes it idempotent.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff33a001';

const meter = new MessengerCallCostService(db);

async function seedCall(
  meCallId: string,
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED',
  durationSec: number,
): Promise<void> {
  await db.admin.messengerCall.create({
    data: { tenantId: T, meCallId, direction, status: 'completed', durationSec },
  });
}

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'mec6',
      slug: `mec6-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('MessengerCallCostService (MEC-06)', () => {
  it('meters an inbound call at $0 and writes a MESSENGER/telephony UsageRecord (never unmetered)', async () => {
    await seedCall('mec6.in', 'USER_INITIATED', 90);
    await meter.meterTerminated(T, 'mec6.in');

    const row = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec6.in' },
    });
    expect(row?.costUsd).toBe(0);
    expect(row?.billedAt).toBeTruthy();

    const usage = await db.admin.usageRecord.findMany({
      where: { tenantId: T, provider: 'MESSENGER', capability: 'telephony' },
    });
    expect(usage.length).toBeGreaterThanOrEqual(1);
    expect(usage.every((u) => u.costUsd === 0)).toBe(true);
    expect(usage.some((u) => u.units === 90)).toBe(true);
  });

  it('is idempotent — a replayed terminate never double-meters (billedAt claim)', async () => {
    await seedCall('mec6.dup', 'USER_INITIATED', 30);
    await meter.meterTerminated(T, 'mec6.dup');
    await meter.meterTerminated(T, 'mec6.dup'); // replay

    const usage = await db.admin.usageRecord.count({
      where: { tenantId: T, provider: 'MESSENGER', units: 30 },
    });
    expect(usage).toBe(1); // exactly one record despite two terminates
  });

  it('meters outbound at the free-tier flat rate ($0) too', async () => {
    await seedCall('mec6.out', 'BUSINESS_INITIATED', 45);
    await meter.meterTerminated(T, 'mec6.out');
    const row = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec6.out' },
    });
    expect(row?.costUsd).toBe(0);
  });
});
