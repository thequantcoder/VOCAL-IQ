import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CallsReadService } from '../calls/calls-read.service';
import { PrismaService } from '../db/prisma.service';
import { TranscriptionService } from './transcription.service';

/**
 * Transcription controls (Day 39), real Postgres + RLS. Proves: no-verbatim cleaning stores
 * a filler-stripped copy only when the agent opts in (raw always kept), source attribution
 * is recorded + surfaced on the call detail, and both are tenant-scoped.
 */

const db = new PrismaService();
const svc = new TranscriptionService(db);
const reads = new CallsReadService(db);

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002'; // C1's parent reseller
const VERB_AGENT = '00000000-0000-0000-0000-0000003b0001'; // noVerbatim = true
const RAW_AGENT = '00000000-0000-0000-0000-0000003b0002'; // noVerbatim = false
const CALL_CLEAN = '00000000-0000-0000-0000-0000003b0003';
const CALL_RAW = '00000000-0000-0000-0000-0000003b0004';
const CALL_SRC = '00000000-0000-0000-0000-0000003b0005';
const R1_AGENT = '00000000-0000-0000-0000-0000003b0006'; // owned by the parent reseller
const CALL_R1 = '00000000-0000-0000-0000-0000003b0007';

const SEGMENTS = [
  { speaker: 'agent', text: 'Um, hello there', startMs: 0 },
  { speaker: 'caller', text: 'uh um', startMs: 10 },
  { speaker: 'agent', text: 'How can I I help?', startMs: 20 },
];

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: VERB_AGENT },
    create: { id: VERB_AGENT, tenantId: C1, name: 'Clean Agent', noVerbatim: true },
    update: { noVerbatim: true },
  });
  await a.agent.upsert({
    where: { id: RAW_AGENT },
    create: { id: RAW_AGENT, tenantId: C1, name: 'Raw Agent', noVerbatim: false },
    update: { noVerbatim: false },
  });
  const mkCall = (id: string, agentId: string) =>
    a.call.upsert({
      where: { id },
      create: {
        id,
        tenantId: C1,
        agentId,
        direction: 'INBOUND',
        channel: 'PSTN',
        status: 'COMPLETED',
      },
      update: {},
    });
  await mkCall(CALL_CLEAN, VERB_AGENT);
  await mkCall(CALL_RAW, RAW_AGENT);
  await mkCall(CALL_SRC, VERB_AGENT);
  for (const callId of [CALL_CLEAN, CALL_RAW, CALL_SRC]) {
    await a.transcript.upsert({
      where: { callId },
      create: { callId, tenantId: C1, segments: SEGMENTS },
      update: { segments: SEGMENTS, sources: [] },
    });
  }
  // A call owned by the PARENT reseller (R1) — the child C1 must not be able to reach it.
  await a.agent.upsert({
    where: { id: R1_AGENT },
    create: { id: R1_AGENT, tenantId: R1, name: 'Parent Agent', noVerbatim: true },
    update: {},
  });
  await a.call.upsert({
    where: { id: CALL_R1 },
    create: {
      id: CALL_R1,
      tenantId: R1,
      agentId: R1_AGENT,
      direction: 'INBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    update: {},
  });
  await a.transcript.upsert({
    where: { callId: CALL_R1 },
    create: { callId: CALL_R1, tenantId: R1, segments: SEGMENTS },
    update: {},
  });
});

afterAll(async () => {
  const ids = [CALL_CLEAN, CALL_RAW, CALL_SRC, CALL_R1];
  await db.admin.transcript.deleteMany({ where: { callId: { in: ids } } });
  await db.admin.call.deleteMany({ where: { id: { in: ids } } });
  await db.admin.agent.deleteMany({ where: { id: { in: [VERB_AGENT, RAW_AGENT, R1_AGENT] } } });
});

describe('TranscriptionService', () => {
  it('no-verbatim: stores a filler-stripped clean copy, keeps the raw segments', async () => {
    const clean = await svc.applyNoVerbatim(C1, CALL_CLEAN);
    expect(clean).not.toBeNull();
    // "uh um" segment drops entirely; fillers + stutters removed from the rest.
    expect(clean?.map((s) => s.text)).toEqual(['hello there', 'How can I help?']);

    const detail = await reads.detail(C1, CALL_CLEAN);
    expect((detail.transcript?.segments as unknown[]).length).toBe(3); // raw untouched
    expect((detail.transcript?.cleanSegments as unknown[]).length).toBe(2);
  });

  it('verbatim agent: no clean copy is written', async () => {
    const clean = await svc.applyNoVerbatim(C1, CALL_RAW);
    expect(clean).toBeNull();
    const detail = await reads.detail(C1, CALL_RAW);
    expect(detail.transcript?.cleanSegments).toBeNull();
  });

  it('records RAG source attribution and surfaces it on the call detail', async () => {
    const cites = await svc.recordSources(
      C1,
      CALL_SRC,
      [
        { id: 'c1', content: 'Refunds within 30 days.', score: 0.4, kbId: 'kb1' },
        { id: 'c2', content: 'Free shipping over $50.', score: 0.9, kbId: 'kb1' },
      ],
      { kb1: 'Policies' },
    );
    expect(cites.map((c) => c.chunkId)).toEqual(['c2', 'c1']); // ranked by score

    const detail = await reads.detail(C1, CALL_SRC);
    const sources = detail.transcript?.sources as { chunkId: string; kbName: string }[];
    expect(sources).toHaveLength(2);
    expect(sources[0]?.kbName).toBe('Policies');
  });

  it("child tenant can't reach the parent reseller's call (RLS)", async () => {
    // CALL_R1 belongs to R1 (parent); C1 is its child → RLS hides the parent's call.
    await expect(svc.applyNoVerbatim(C1, CALL_R1)).rejects.toSatisfy(isAppError);
  });
});
