import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type QaCompleter, QaService } from './qa.service';

/**
 * QA scoring (Day 43) against real Postgres + RLS. Proves: rubric CRUD is tenant-scoped,
 * scoreCallNow evaluates + persists a weighted score (via an injected fake LLM), the
 * aggregate rolls up per-rubric/criterion, and — the headline (self-audit B) — a tenant
 * never sees another tenant's rubrics or scores.
 */

const db = new PrismaService();

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const AG = '00000000-0000-0000-0000-0000043a0001';
const AG_R1 = '00000000-0000-0000-0000-0000043a0002';

const SCORE_JSON = JSON.stringify({
  results: [
    { key: 'greeting', score: 1, reason: 'greeted' },
    { key: 'booking', score: 0, reason: 'no booking' },
  ],
});
const completer: QaCompleter = vi.fn(async () => ({ text: SCORE_JSON, model: 'fake-eval' }));
const svc = new QaService(db, completer);

const callIds: string[] = [];
const rubricIds: string[] = [];

async function mkCall(tenantId: string, agentId: string) {
  const call = await db.admin.call.create({
    data: { tenantId, agentId, direction: 'OUTBOUND', channel: 'PSTN', status: 'COMPLETED' },
    select: { id: true },
  });
  callIds.push(call.id);
  await db.admin.transcript.create({
    data: {
      callId: call.id,
      tenantId,
      segments: [
        { speaker: 'agent', text: 'Hello, VocalIQ here.' },
        { speaker: 'caller', text: 'Just a question, no booking today.' },
      ],
    },
  });
  return call.id;
}

let c1Call: string;

beforeAll(async () => {
  for (const [id, tenantId] of [
    [AG, C1],
    [AG_R1, R1],
  ] as const) {
    await db.admin.agent.upsert({
      where: { id },
      create: { id, tenantId, name: `A-${id.slice(-4)}` },
      update: {},
    });
  }
  c1Call = await mkCall(C1, AG);
});

afterAll(async () => {
  await db.admin.qaScore.deleteMany({ where: { callId: { in: callIds } } });
  await db.admin.qaRubric.deleteMany({ where: { id: { in: rubricIds } } });
  await db.admin.transcript.deleteMany({ where: { callId: { in: callIds } } });
  await db.admin.call.deleteMany({ where: { id: { in: callIds } } });
  await db.admin.agent.deleteMany({ where: { id: { in: [AG, AG_R1] } } });
});

describe('QaService rubric CRUD (RLS)', () => {
  it('creates, lists, updates and scopes rubrics to the tenant', async () => {
    const created = await svc.createRubric(C1, {
      name: 'Sales QA',
      criteria: [
        { key: 'greeting', description: 'Agent greeted', weight: 1 },
        { key: 'booking', description: 'Confirmed a booking', weight: 3 },
      ],
      samplingRate: 1,
      active: true,
    });
    rubricIds.push(created.id);
    expect(created.criteria).toHaveLength(2);

    const list = await svc.listRubrics(C1);
    expect(list.some((r) => r.id === created.id)).toBe(true);

    const updated = await svc.updateRubric(C1, created.id, { active: false });
    expect(updated.active).toBe(false);
    await svc.updateRubric(C1, created.id, { active: true }); // restore for scoring test

    // Isolation direction (RLS): the child C1 cannot see a rubric owned by the parent R1.
    const parentRubric = await svc.createRubric(R1, {
      name: 'Parent-only rubric',
      criteria: [{ key: 'secret', description: 'parent secret criterion', weight: 1 }],
      samplingRate: 1,
      active: true,
    });
    rubricIds.push(parentRubric.id);
    expect((await svc.listRubrics(C1)).some((r) => r.id === parentRubric.id)).toBe(false);
    // C1 cannot mutate the parent's rubric either (NotFound under RLS).
    await expect(svc.updateRubric(C1, parentRubric.id, { active: false })).rejects.toThrow();
  });
});

describe('QaService.scoreCallNow', () => {
  it('scores the call against active rubrics and persists a weighted overall', async () => {
    const scores = await svc.scoreCallNow(C1, c1Call);
    expect(scores).toHaveLength(1);
    // greeting=1 (w1), booking=0 (w3) → 1/4 * 100 = 25
    expect(scores[0]?.overall).toBe(25);
    expect(scores[0]?.model).toBe('fake-eval');

    // Idempotent: re-scoring upserts (still one row for this call+rubric).
    await svc.scoreCallNow(C1, c1Call);
    const stored = await svc.scoresForCall(C1, c1Call);
    expect(stored).toHaveLength(1);
  });

  it('aggregates per-rubric + per-criterion averages', async () => {
    const agg = await svc.aggregate(C1, {});
    expect(agg.length).toBeGreaterThan(0);
    const rubric = agg[0];
    expect(rubric?.avgOverall).toBe(25);
    expect(rubric?.criteria.find((c) => c.key === 'greeting')?.avgScore).toBe(1);
    expect(rubric?.criteria.find((c) => c.key === 'booking')?.avgScore).toBe(0);
  });

  it("a child never sees the parent's scores (self-audit B)", async () => {
    // Score a parent (R1) call, then assert the child C1 cannot see it.
    const r1Call = await mkCall(R1, AG_R1);
    const r1Scores = await svc.scoreCallNow(R1, r1Call);
    expect(r1Scores.length).toBeGreaterThan(0); // R1 sees its own + (as parent) descendants' rubrics

    // C1 (child) reading the parent's call scores sees nothing (RLS).
    expect(await svc.scoresForCall(C1, r1Call)).toHaveLength(0);
    // C1's aggregate never includes the parent-only rubric.
    const parentRubricId = rubricIds[1];
    const c1Agg = await svc.aggregate(C1, {});
    expect(c1Agg.some((a) => a.rubricId === parentRubricId)).toBe(false);
  });
});
