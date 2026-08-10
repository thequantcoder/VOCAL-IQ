import { MIN_PEER_COHORT } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { BenchmarkingService } from './benchmarking.service';

/**
 * Analytics benchmarking (Day 86) — real Postgres. Proves internal per-agent comparison, the OPT-IN gate
 * (self-audit C), the k-ANONYMITY gate + aggregate-only peer output with zero per-peer leakage
 * (self-audit B), and tenant scoping.
 */

const db = new PrismaService();
const svc = new BenchmarkingService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const SELF = '00000000-0000-0000-0000-0000086a0001';
const A1 = '00000000-0000-0000-0000-0000086a00a1';
const A2 = '00000000-0000-0000-0000-0000086a00a2';
// Six opted-in peers in the SAME industry (≥ MIN_PEER_COHORT), one opted-in OTHER industry, one NOT opted-in.
const PEERS = Array.from({ length: 6 }, (_, i) => `00000000-0000-0000-0000-0000086b00${i + 10}`);
const OTHER_INDUSTRY = '00000000-0000-0000-0000-0000086c0001';
const NOT_OPTED = '00000000-0000-0000-0000-0000086c0002';
const ALL_TENANTS = [SELF, ...PEERS, OTHER_INDUSTRY, NOT_OPTED];

const now = new Date();
const within = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

async function makeTenant(id: string, settings: object) {
  await db.admin.tenant.upsert({
    where: { id },
    create: {
      id,
      type: 'CUSTOMER',
      name: `Bench ${id.slice(-4)}`,
      slug: `bench-${id.slice(-4)}-${Date.now()}`,
      parentTenantId: PLATFORM,
      status: 'ACTIVE',
      settings: settings as object,
    },
    update: { status: 'ACTIVE', settings: settings as object },
  });
}

/** Seed a tenant with N calls (some completed) + usage cost + revenue, under one agent. */
async function seedData(
  tenantId: string,
  agentId: string,
  opts: {
    calls: number;
    completed: number;
    costUsd: number;
    revenueCents: number;
    sentiment: number;
  },
) {
  await db.admin.agent.upsert({
    where: { id: agentId },
    create: { id: agentId, tenantId, name: `A-${agentId.slice(-4)}` },
    update: {},
  });
  for (let i = 0; i < opts.calls; i++) {
    const status = i < opts.completed ? 'COMPLETED' : 'FAILED';
    const call = await db.admin.call.create({
      data: {
        tenantId,
        agentId,
        direction: 'OUTBOUND',
        channel: 'PSTN',
        status: status as never,
        sentiment: opts.sentiment,
        durationSec: 60,
        createdAt: within,
      },
    });
    await db.admin.usageRecord.create({
      data: {
        tenantId,
        callId: call.id,
        provider: 'OPENAI',
        capability: 'llm',
        units: 100,
        costUsd: opts.costUsd / opts.calls,
        ts: within,
      },
    });
  }
  if (opts.revenueCents > 0) {
    await db.admin.revenueEvent.create({
      data: {
        tenantId,
        agentId,
        amountCents: opts.revenueCents,
        source: 'manual',
        occurredAt: within,
      },
    });
  }
}

beforeAll(async () => {
  // SELF: opted-in, financial_services, two agents (A1 strong, A2 weak).
  await makeTenant(SELF, { benchmarkOptIn: true, benchmarkIndustry: 'financial_services' });
  await seedData(SELF, A1, {
    calls: 10,
    completed: 9,
    costUsd: 1.0,
    revenueCents: 50000,
    sentiment: 0.8,
  });
  await seedData(SELF, A2, {
    calls: 10,
    completed: 3,
    costUsd: 3.0,
    revenueCents: 5000,
    sentiment: 0.2,
  });
  // 6 opted-in peers, same industry, with data.
  for (let i = 0; i < PEERS.length; i++) {
    await makeTenant(PEERS[i]!, { benchmarkOptIn: true, benchmarkIndustry: 'financial_services' });
    await seedData(PEERS[i]!, `00000000-0000-0000-0000-0000086b0a${i + 10}`, {
      calls: 10,
      completed: 5 + i, // 5..10 completed → spread of success rates
      costUsd: 2.0,
      revenueCents: 20000,
      sentiment: 0.5,
    });
  }
  // One opted-in but DIFFERENT industry (must never be aggregated into financial_services).
  await makeTenant(OTHER_INDUSTRY, { benchmarkOptIn: true, benchmarkIndustry: 'healthcare' });
  await seedData(OTHER_INDUSTRY, '00000000-0000-0000-0000-0000086c00a1', {
    calls: 10,
    completed: 10,
    costUsd: 0.1,
    revenueCents: 999999,
    sentiment: 1,
  });
  // One same-industry but NOT opted-in (must never be aggregated).
  await makeTenant(NOT_OPTED, { benchmarkOptIn: false, benchmarkIndustry: 'financial_services' });
  await seedData(NOT_OPTED, '00000000-0000-0000-0000-0000086c00a2', {
    calls: 10,
    completed: 10,
    costUsd: 0.1,
    revenueCents: 999999,
    sentiment: 1,
  });
});

afterAll(async () => {
  await db.admin.revenueEvent.deleteMany({ where: { tenantId: { in: ALL_TENANTS } } });
  await db.admin.usageRecord.deleteMany({ where: { tenantId: { in: ALL_TENANTS } } });
  await db.admin.call.deleteMany({ where: { tenantId: { in: ALL_TENANTS } } });
  await db.admin.agent.deleteMany({ where: { tenantId: { in: ALL_TENANTS } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: ALL_TENANTS } } });
});

describe('Settings (opt-in + industry)', () => {
  it('reads and updates the opt-in + industry', async () => {
    const s0 = await svc.getSettings(SELF);
    expect(s0.optIn).toBe(true);
    expect(s0.industry).toBe('financial_services');
    const s1 = await svc.updateSettings(SELF, { optIn: true, industry: 'retail' });
    expect(s1.industry).toBe('retail');
    // restore for the peer tests
    await svc.updateSettings(SELF, { optIn: true, industry: 'financial_services' });
  });
});

describe('Internal per-agent benchmark (self-audit A)', () => {
  it('compares the tenant’s own agents and flags the strong one as best', async () => {
    const b = await svc.internal(SELF);
    expect(b.agents.length).toBe(2);
    // A1 (9/10 completed, cheap, high revenue) should be best on success rate + roi.
    expect(b.best.successRate).toBe(A1);
    expect(b.best.roiPercent).toBe(A1);
    // The tenant overall trails its best agent → at least one recommendation.
    expect(b.recommendations.length).toBeGreaterThan(0);
  });
});

describe('Peer benchmark — opt-in gate (self-audit C)', () => {
  it('denies peer data to a tenant that has not opted in', async () => {
    await svc.updateSettings(SELF, { optIn: false, industry: 'financial_services' });
    const p = await svc.peers(SELF);
    expect(p.available).toBe(false);
    if (!p.available) expect(p.reason).toBe('opt_in_required');
    await svc.updateSettings(SELF, { optIn: true, industry: 'financial_services' }); // restore
  });
});

describe('Peer benchmark — k-anonymity + zero leakage (self-audit B)', () => {
  it('withholds ALL peer data when the cohort is below the threshold', async () => {
    // Move self to an industry where it has < MIN_PEER_COHORT opted-in peers.
    await svc.updateSettings(SELF, { optIn: true, industry: 'legal' });
    const p = await svc.peers(SELF);
    expect(p.available).toBe(false);
    if (!p.available) {
      expect(p.reason).toBe('insufficient_cohort');
      expect(p.cohortSize).toBeLessThan(MIN_PEER_COHORT);
    }
    await svc.updateSettings(SELF, { optIn: true, industry: 'financial_services' }); // restore
  });

  it('exposes ONLY aggregates (mean/median/quartiles + percentile) — never a peer id or raw value', async () => {
    const p = await svc.peers(SELF);
    expect(p.available).toBe(true);
    if (!p.available) return;
    expect(p.cohortSize).toBe(PEERS.length); // the 6 opted-in same-industry peers (NOT the other-industry / not-opted ones)
    expect(p.industry).toBe('financial_services');
    expect(p.metrics.length).toBeGreaterThan(0);

    for (const m of p.metrics) {
      // Each metric only carries a peer-safe summary — no per-tenant array, no ids, and crucially NO
      // min/max (those would be a single peer's exact value — self-audit B).
      expect(m.peer.count).toBeGreaterThanOrEqual(MIN_PEER_COHORT);
      expect(m.percentile).toBeGreaterThanOrEqual(0);
      expect(m.percentile).toBeLessThanOrEqual(100);
      expect(Object.keys(m.peer).sort()).toEqual(['count', 'mean', 'median', 'p25', 'p75'].sort());
      expect(m.peer).not.toHaveProperty('min');
      expect(m.peer).not.toHaveProperty('max');
    }
    // Serialize the whole response — no tenant UUID from any peer may appear anywhere.
    const json = JSON.stringify(p);
    for (const id of [...PEERS, OTHER_INDUSTRY, NOT_OPTED]) {
      expect(json.includes(id)).toBe(false);
    }
  });

  it('never aggregates a different-industry or non-opted-in tenant (isolation)', async () => {
    // The OTHER_INDUSTRY + NOT_OPTED tenants have extreme values (100% success, 999999 revenue). If they
    // leaked in, the peer max would spike far beyond the honest peers' ~ range. Assert they did not.
    const p = await svc.peers(SELF);
    if (!p.available) throw new Error('expected available');
    const success = p.metrics.find((m) => m.key === 'successRate');
    // Honest peers top out at 100% completed (peer i=5 → 10/10). But the leak tenants also have 100%,
    // so instead assert the COUNT is exactly the honest cohort (proven above) — the definitive check.
    expect(success?.peer.count).toBe(PEERS.length);
  });
});
