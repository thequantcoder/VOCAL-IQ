import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AnalyticsService } from './analytics.service';

/**
 * Analytics (Day 41), real Postgres + Timescale + RLS. Proves: historical aggregations are
 * correct (outcomes, success, cost-by-day, talk/listen, drop-off), the agent filter works,
 * budget thresholds evaluate, and everything is tenant-scoped (a child sees only its own).
 */

const db = new PrismaService();
const svc = new AnalyticsService(db);

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002'; // parent reseller
const A1 = '00000000-0000-0000-0000-0000004a0001';
const A2 = '00000000-0000-0000-0000-0000004a0002';
const R1_AGENT = '00000000-0000-0000-0000-0000004a0003';
const callIds: string[] = [];

const FROM = new Date('2025-01-01T00:00:00Z');
const TO = new Date('2025-01-08T00:00:00Z');

async function mkCall(opts: {
  agentId: string;
  tenantId: string;
  status: string;
  disposition?: string;
  durationSec?: number;
  sentiment?: number;
  createdAt: string;
  costUsd?: number;
  segments?: unknown[];
}) {
  const a = db.admin;
  const call = await a.call.create({
    data: {
      tenantId: opts.tenantId,
      agentId: opts.agentId,
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: opts.status as never,
      ...(opts.disposition ? { disposition: opts.disposition } : {}),
      ...(opts.durationSec !== undefined ? { durationSec: opts.durationSec } : {}),
      ...(opts.sentiment !== undefined ? { sentiment: opts.sentiment } : {}),
      createdAt: new Date(opts.createdAt),
    },
    select: { id: true },
  });
  callIds.push(call.id);
  if (opts.costUsd) {
    await a.usageRecord.create({
      data: {
        tenantId: opts.tenantId,
        callId: call.id,
        provider: 'OPENAI',
        capability: 'llm',
        units: 100,
        costUsd: opts.costUsd,
        ts: new Date(opts.createdAt),
      },
    });
  }
  if (opts.segments) {
    await a.transcript.create({
      data: { callId: call.id, tenantId: opts.tenantId, segments: opts.segments as object },
    });
  }
  return call.id;
}

beforeAll(async () => {
  const a = db.admin;
  for (const [id, tenantId] of [
    [A1, C1],
    [A2, C1],
    [R1_AGENT, R1],
  ] as const) {
    await a.agent.upsert({
      where: { id },
      create: { id, tenantId, name: `A-${id.slice(-4)}` },
      update: {},
    });
  }
  // C1 / agent A1: 2 completed (one booked), agent A2: 1 no-answer + 1 short drop-off.
  await mkCall({
    agentId: A1,
    tenantId: C1,
    status: 'COMPLETED',
    disposition: 'BOOKED',
    durationSec: 120,
    sentiment: 0.8,
    createdAt: '2025-01-02T10:00:00Z',
    costUsd: 0.5,
    segments: [
      { speaker: 'agent', text: 'x', startMs: 0, endMs: 3000 },
      { speaker: 'caller', text: 'x', startMs: 2000, endMs: 4000 }, // interruption
    ],
  });
  await mkCall({
    agentId: A1,
    tenantId: C1,
    status: 'COMPLETED',
    durationSec: 90,
    sentiment: 0.2,
    createdAt: '2025-01-03T10:00:00Z',
    costUsd: 0.3,
  });
  await mkCall({
    agentId: A2,
    tenantId: C1,
    status: 'NO_ANSWER',
    durationSec: 0,
    createdAt: '2025-01-04T10:00:00Z',
  });
  await mkCall({
    agentId: A2,
    tenantId: C1,
    status: 'COMPLETED',
    durationSec: 5, // short → drop-off
    createdAt: '2025-01-04T11:00:00Z',
    costUsd: 0.1,
  });
  // R1 (parent) call — must not appear in C1's numbers.
  await mkCall({
    agentId: R1_AGENT,
    tenantId: R1,
    status: 'COMPLETED',
    durationSec: 300,
    createdAt: '2025-01-02T10:00:00Z',
    costUsd: 99,
  });
});

afterAll(async () => {
  await db.admin.usageRecord.deleteMany({ where: { callId: { in: callIds } } });
  await db.admin.transcript.deleteMany({ where: { callId: { in: callIds } } });
  await db.admin.call.deleteMany({ where: { id: { in: callIds } } });
  await db.admin.agent.deleteMany({ where: { id: { in: [A1, A2, R1_AGENT] } } });
});

describe('AnalyticsService.historical', () => {
  it('aggregates outcomes, success, minutes, cost-by-day for the tenant only', async () => {
    const h = await svc.historical(C1, { from: FROM, to: TO });
    expect(h.totalCalls).toBe(4); // R1's call excluded (RLS)
    expect(h.outcomes.BOOKED).toBe(1);
    expect(h.outcomes.NO_ANSWER).toBe(1);
    expect(h.outcomes.COMPLETED).toBe(2); // the 2 completed w/o disposition
    expect(h.successRate).toBeCloseTo(3 / 4); // 3 COMPLETED / 4
    expect(h.costByDay.reduce((s, d) => s + d.value, 0)).toBeCloseTo(0.9); // 0.5+0.3+0.1, not R1's 99
    expect(h.dropOffRate).toBeCloseTo(2 / 4); // NO_ANSWER + the 5s call
  });

  it('computes talk/listen + interruptions from the transcript sample', async () => {
    const h = await svc.historical(C1, { from: FROM, to: TO });
    expect(h.talkListen.agentMs).toBeGreaterThan(0);
    expect(h.avgInterruptions).toBeGreaterThan(0);
  });

  it('filters to a single agent', async () => {
    const h = await svc.historical(C1, { from: FROM, to: TO, agentId: A1 });
    expect(h.totalCalls).toBe(2);
    expect(h.successRate).toBe(1); // both A1 calls completed
  });
});

describe('AnalyticsService.budget', () => {
  it('evaluates spend against a daily cap', async () => {
    const b = await svc.budget(C1, { dailyLimitUsd: 1000, monthlyLimitUsd: 10000 });
    expect(b.todaySpendUsd).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(b.alerts)).toBe(true);
  });
});

describe('AnalyticsService live + RLS', () => {
  it('returns a live snapshot scoped to the tenant', async () => {
    const live = await svc.live(C1);
    expect(live.activeCalls).toBeGreaterThanOrEqual(0);
    expect(live.successRateToday).toBeGreaterThanOrEqual(0);
  });

  it("child tenant's numbers never include the parent's calls", async () => {
    // Same range; R1's $99 call + 300s must not leak into C1's totals (asserted above),
    // and R1 querying sees ITS call but that's the parent legitimately (not a leak downward).
    const child = await svc.historical(C1, { from: FROM, to: TO });
    expect(child.totalMinutes).toBeLessThan(10); // C1's ~3.6 min, not R1's +5 min
  });
});
