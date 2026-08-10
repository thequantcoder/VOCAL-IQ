import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { CostService } from './cost.service';

/**
 * Cost attribution engine (real Postgres, RLS-scoped). Proves the Day-13 self-audit
 * focus: accurate per-call breakdown, BYOK excluded from billable, fast rollups, and
 * reconciliation flags an un-metered COMPLETED call. Test data is pinned to a fixed
 * historical window so rollups are deterministic regardless of other suites.
 */

const db = new PrismaService();
const cost = new CostService(db);

const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000002a0001';
const CALL_METERED = '00000000-0000-0000-0000-0000002a0002';
const CALL_UNMETERED = '00000000-0000-0000-0000-0000002a0003';
const CALL_NO_ANSWER = '00000000-0000-0000-0000-0000002a0004';

const T0 = new Date('2020-01-15T10:00:00Z');
const FROM = new Date('2020-01-01T00:00:00Z');
const TO = new Date('2020-02-01T00:00:00Z');

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Cost Agent' },
    update: {},
  });
  const mkCall = (id: string, status: 'COMPLETED' | 'NO_ANSWER') =>
    a.call.upsert({
      where: { id },
      create: {
        id,
        tenantId: C1,
        agentId: AGENT,
        direction: 'OUTBOUND',
        channel: 'PSTN',
        status,
        createdAt: T0,
      },
      update: { status },
    });
  await mkCall(CALL_METERED, 'COMPLETED');
  await mkCall(CALL_UNMETERED, 'COMPLETED');
  await mkCall(CALL_NO_ANSWER, 'NO_ANSWER');

  // Metered call: managed STT/LLM/TTS/telephony + one BYOK LLM (informational only).
  const usage = [
    { provider: 'DEEPGRAM', capability: 'stt', units: 30, costUsd: 0.005, byok: false },
    { provider: 'OPENAI', capability: 'llm', units: 800, costUsd: 0.01, byok: false },
    { provider: 'ELEVENLABS', capability: 'tts', units: 200, costUsd: 0.02, byok: false },
    { provider: 'TWILIO', capability: 'telephony', units: 60, costUsd: 0.014, byok: false },
    { provider: 'OPENAI', capability: 'llm', units: 500, costUsd: 0.03, byok: true },
  ] as const;
  for (const u of usage) {
    await a.usageRecord.create({ data: { tenantId: C1, callId: CALL_METERED, ts: T0, ...u } });
  }
});

afterAll(async () => {
  const a = db.admin;
  await a.usageRecord.deleteMany({ where: { callId: CALL_METERED } });
  await a.call.deleteMany({ where: { agentId: AGENT } });
  await a.agent.deleteMany({ where: { id: AGENT } });
});

describe('CostService.aggregateCall', () => {
  it('sums per capability; total includes BYOK, billable excludes it', async () => {
    const bd = await cost.aggregateCall(C1, CALL_METERED);
    expect(bd.stt).toBeCloseTo(0.005, 6);
    expect(bd.llm).toBeCloseTo(0.04, 6); // 0.01 managed + 0.03 BYOK
    expect(bd.tts).toBeCloseTo(0.02, 6);
    expect(bd.telephony).toBeCloseTo(0.014, 6);
    expect(bd.total).toBeCloseTo(0.079, 6);
    expect(bd.billable).toBeCloseTo(0.049, 6); // total minus the 0.03 BYOK

    // Persisted onto the Call row.
    const row = await db.admin.call.findUnique({ where: { id: CALL_METERED } });
    expect((row?.costBreakdown as { billable: number }).billable).toBeCloseTo(0.049, 6);
  });

  it('404s an unknown call', async () => {
    await expect(
      cost.aggregateCall(C1, '00000000-0000-0000-0000-0000009a9999'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('CostService.callCost', () => {
  it('returns the breakdown + the underlying usage records', async () => {
    const res = await cost.callCost(C1, CALL_METERED);
    expect(res.breakdown.billable).toBeCloseTo(0.049, 6);
    expect(res.records).toHaveLength(5);
    expect(res.records.every((r) => r.costUsd >= 0)).toBe(true);
  });
});

describe('CostService.rollup', () => {
  it('groups by capability', async () => {
    const rows = await cost.rollup(C1, { from: FROM, to: TO, groupBy: 'capability' });
    const llm = rows.find((r) => r.key === 'llm');
    const telephony = rows.find((r) => r.key === 'telephony');
    expect(llm).toBeDefined();
    expect(llm?.totalUsd).toBeCloseTo(0.04, 6);
    expect(llm?.billableUsd).toBeCloseTo(0.01, 6); // BYOK excluded
    expect(telephony?.totalUsd).toBeCloseTo(0.014, 6);
  });

  it('groups by day (Timescale time_bucket)', async () => {
    const rows = await cost.rollup(C1, { from: FROM, to: TO, groupBy: 'day' });
    const day = rows.find((r) => r.key === '2020-01-15');
    expect(day?.totalUsd).toBeCloseTo(0.079, 6);
    expect(day?.billableUsd).toBeCloseTo(0.049, 6);
  });

  it('groups by agent', async () => {
    const rows = await cost.rollup(C1, { from: FROM, to: TO, groupBy: 'agent' });
    const mine = rows.find((r) => r.key === AGENT);
    expect(mine?.totalUsd).toBeCloseTo(0.079, 6);
  });
});

describe('CostService.reconcile', () => {
  it('flags a COMPLETED call with zero usage, ignores metered + non-completed', async () => {
    const res = await cost.reconcile(C1, { from: FROM, to: TO });
    expect(res.unmeteredCallIds).toContain(CALL_UNMETERED);
    expect(res.unmeteredCallIds).not.toContain(CALL_METERED);
    expect(res.unmeteredCallIds).not.toContain(CALL_NO_ANSWER); // no-answer legitimately has no usage
  });
});
