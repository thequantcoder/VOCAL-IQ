import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { whatsappCallPeriod } from './whatsapp-call-cost.service';
import { WhatsAppCallReadService } from './whatsapp-call-read.service';

/**
 * WhatsApp Calling dashboard read model (WAC-07) against real Postgres + RLS. Dedicated tenants so the
 * KPI counts + recent feed are deterministic and isolation is provable.
 */
const db = new PrismaService();
const svc = new WhatsAppCallReadService(db);
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff22a001';
const T2 = '00000000-0000-0000-0000-0000ff22a002';
const T3 = '00000000-0000-0000-0000-0000ff22a003';
const AG3 = '00000000-0000-0000-0000-0000ff22b003';
const CID3 = '00000000-0000-0000-0000-0000ff22c003';

beforeAll(async () => {
  for (const id of [T, T2, T3]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac7-${id.slice(-4)}`,
        slug: `wac7-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.tenant.update({
    where: { id: T },
    data: { settings: { whatsappCalling: { enabled: true } } },
  });
  // Two answered + one failed today; a metered outbound cost; monthly volume for the tier read.
  await db.admin.whatsAppCall.createMany({
    data: [
      {
        tenantId: T,
        waCallId: 'r.in1',
        direction: 'USER_INITIATED',
        status: 'completed',
        durationSec: 60,
        costUsd: 0,
      },
      {
        tenantId: T,
        waCallId: 'r.out1',
        direction: 'BUSINESS_INITIATED',
        status: 'completed',
        durationSec: 120,
        costUsd: 0.02,
        billedCountry: 'US',
      },
      {
        tenantId: T,
        waCallId: 'r.fail1',
        direction: 'BUSINESS_INITIATED',
        status: 'failed',
        durationSec: 0,
        costUsd: 0,
      },
      // A sibling-tenant row that RLS must hide from T's overview.
      {
        tenantId: T2,
        waCallId: 'x.other',
        direction: 'USER_INITIATED',
        status: 'completed',
        durationSec: 999,
        costUsd: 9.99,
      },
    ],
  });
  await db.admin.whatsAppCallVolume.create({
    data: { tenantId: T, period: whatsappCallPeriod(), billedSeconds: 180 },
  });

  // T3: a live-call fixture — an accepted call linked to a unified Call + agent, with context + events.
  await db.admin.agent.create({
    data: { id: AG3, tenantId: T3, name: 'Live Agent', status: 'PUBLISHED' },
  });
  await db.admin.call.create({
    data: {
      id: CID3,
      tenantId: T3,
      agentId: AG3,
      direction: 'INBOUND',
      channel: 'WHATSAPP',
      status: 'IN_PROGRESS',
    },
  });
  await db.admin.whatsAppCall.create({
    data: {
      tenantId: T3,
      waCallId: 'r.live',
      direction: 'USER_INITIATED',
      status: 'accepted',
      fromNumber: '14155551234',
      toNumber: '16315553601',
      ctaPayload: 'intent=book_demo&ref=A1234',
      callId: CID3,
      durationSec: 12,
      startedAt: new Date('2021-03-01T12:00:00Z'),
    },
  });
  await db.admin.whatsAppCallEvent.createMany({
    data: [
      { tenantId: T3, waCallId: 'r.live', event: 'connect', payload: {} },
      { tenantId: T3, waCallId: 'r.live', event: 'status', payload: {} },
    ],
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2, T3] } } });
});

describe('WhatsAppCallReadService.overview', () => {
  it('reports enabled + today KPIs + monthly tier + recent feed, tenant-scoped', async () => {
    const o = await svc.overview(T);

    expect(o.enabled).toBe(true);
    expect(o.stats.callsToday).toBe(3);
    expect(o.stats.answeredToday).toBe(2); // two completed; the failed one doesn't count
    expect(o.stats.avgDurationSec).toBe(60); // (60 + 120 + 0) / 3
    expect(o.stats.costTodayUsd).toBeCloseTo(0.02, 6);

    expect(o.monthly.minutes).toBe(3); // 180 billed s / 60
    expect(o.monthly.tier).toBe('tier0');

    // Recent feed is this tenant's only — the sibling's row is invisible under RLS.
    expect(o.recent).toHaveLength(3);
    expect(o.recent.every((c) => c.waCallId !== 'x.other')).toBe(true);
  });

  it('defaults cleanly for a tenant with no WhatsApp calls or settings', async () => {
    const o = await svc.overview(T2);
    expect(o.enabled).toBe(false);
    expect(o.stats.callsToday).toBe(1); // only its own row
    expect(o.recent.every((c) => c.waCallId === 'x.other')).toBe(true);
    expect(o.monthly.tier).toBe('tier0');
  });
});

describe('WhatsAppCallReadService.liveCall', () => {
  it('returns identity + decoded context + linked agent + status timeline', async () => {
    const live = await svc.liveCall(T3, 'r.live');
    expect(live.status).toBe('accepted');
    expect(live.direction).toBe('USER_INITIATED');
    expect(live.fromNumber).toBe('14155551234');
    expect(live.context.intent).toBe('book_demo');
    expect(live.context.reference).toBe('A1234');
    expect(live.callId).toBe(CID3);
    expect(live.agent?.id).toBe(AG3);
    expect(live.agent?.name).toBe('Live Agent');
    expect(live.durationSec).toBe(12);
    expect(live.events.map((e) => e.event)).toEqual(['connect', 'status']);
  });

  it('is tenant-isolated + 404s an unknown call (RLS)', async () => {
    // Another tenant cannot resolve T3's call → NotFound (same path as a truly-missing id).
    await expect(svc.liveCall(T, 'r.live')).rejects.toThrow();
    await expect(svc.liveCall(T3, 'nope')).rejects.toThrow();
  });
});
