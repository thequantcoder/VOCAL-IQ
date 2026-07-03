import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { Embedder, UsageSink } from '../rag/rag.service';
import { SearchService } from './search.service';

/**
 * Transcript search (Day 42) against real Postgres FTS + pgvector + RLS. Proves: keyword
 * (FTS) finds the right calls, semantic search ranks by the deterministic embedder,
 * jump-to-moment resolves the matching segment offset, and — the headline (self-audit B) —
 * a tenant NEVER sees another tenant's transcripts, even through the raw FTS/vector SQL.
 */

const db = new PrismaService();

// A deterministic keyword embedder: each known term lights up one dimension, so cosine
// ordering is predictable without live OpenAI (mirrors the RAG test).
const KEYWORDS = ['refund', 'shipping', 'warranty', 'pricing', 'cancel'];
const fakeEmbed: Embedder = (texts) =>
  Promise.resolve(
    texts.map((t) => {
      const v = new Array<number>(1536).fill(0);
      const lower = t.toLowerCase();
      KEYWORDS.forEach((kw, i) => {
        if (lower.includes(kw)) v[i] = 1;
      });
      v[1535] = 0.01; // non-zero so cosine distance is defined
      return v;
    }),
  );

class RecordingUsage implements UsageSink {
  readonly calls: { tenantId: string; units: number; costUsd: number }[] = [];
  async record(tenantId: string, units: number, costUsd: number): Promise<void> {
    this.calls.push({ tenantId, units, costUsd });
  }
}

const usage = new RecordingUsage();
const svc = new SearchService(db, fakeEmbed, usage);

const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const AG = '00000000-0000-0000-0000-0000042a0001';
const AG_R1 = '00000000-0000-0000-0000-0000042a0002';
const callIds: string[] = [];

async function mkCall(opts: {
  tenantId: string;
  agentId: string;
  segments: { speaker: string; text: string; startMs: number }[];
}) {
  const a = db.admin;
  const call = await a.call.create({
    data: {
      tenantId: opts.tenantId,
      agentId: opts.agentId,
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: 'COMPLETED',
    },
    select: { id: true },
  });
  callIds.push(call.id);
  await a.transcript.create({
    data: { callId: call.id, tenantId: opts.tenantId, segments: opts.segments as object },
  });
  return call.id;
}

let refundCallId: string;

beforeAll(async () => {
  const a = db.admin;
  for (const [id, tenantId] of [
    [AG, C1],
    [AG_R1, R1],
  ] as const) {
    await a.agent.upsert({
      where: { id },
      create: { id, tenantId, name: `A-${id.slice(-4)}` },
      update: {},
    });
  }

  refundCallId = await mkCall({
    tenantId: C1,
    agentId: AG,
    segments: [
      { speaker: 'agent', text: 'Thanks for calling, how can I help today?', startMs: 0 },
      { speaker: 'caller', text: 'I need a refund for my broken order', startMs: 5000 },
      { speaker: 'agent', text: 'I can process that refund right away', startMs: 9000 },
    ],
  });
  await mkCall({
    tenantId: C1,
    agentId: AG,
    segments: [
      { speaker: 'caller', text: 'What is your shipping policy for large items?', startMs: 0 },
      { speaker: 'agent', text: 'Shipping is free over fifty dollars', startMs: 3000 },
    ],
  });
  // R1 (parent) transcript that ALSO mentions refund — must never surface for C1.
  await mkCall({
    tenantId: R1,
    agentId: AG_R1,
    segments: [{ speaker: 'caller', text: 'secret parent refund conversation', startMs: 0 }],
  });

  // Index all three transcripts for their own tenants.
  await svc.indexTranscript(C1, refundCallId);
  await svc.reindexTenant(C1);
  await svc.reindexTenant(R1);
});

afterAll(async () => {
  await db.admin.transcript.deleteMany({ where: { callId: { in: callIds } } });
  await db.admin.call.deleteMany({ where: { id: { in: callIds } } });
  await db.admin.agent.deleteMany({ where: { id: { in: [AG, AG_R1] } } });
});

describe('SearchService keyword (FTS)', () => {
  it('finds the call whose transcript matches the keyword', async () => {
    const hits = await svc.search(C1, { q: 'refund', mode: 'keyword' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.callId).toBe(refundCallId);
    expect(hits[0]?.snippet.toLowerCase()).toContain('refund');
  });

  it('resolves jump-to-moment to the matching segment offset', async () => {
    const hits = await svc.search(C1, { q: 'refund order', mode: 'keyword' });
    const hit = hits.find((h) => h.callId === refundCallId);
    expect(hit?.startMs).toBe(5000); // the caller segment with "refund" + "order"
  });
});

describe('SearchService semantic (pgvector)', () => {
  it('ranks the refund call top for a refund query', async () => {
    const hits = await svc.search(C1, { q: 'refund', mode: 'semantic' });
    expect(hits[0]?.callId).toBe(refundCallId);
  });
});

describe('SearchService hybrid + RLS', () => {
  it('hybrid returns tenant results', async () => {
    const hits = await svc.search(C1, { q: 'shipping', mode: 'hybrid' });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('NEVER returns another tenant’s transcript (self-audit B)', async () => {
    const hits = await svc.search(C1, { q: 'refund', mode: 'hybrid', limit: 50 });
    // C1 sees its own refund call; the R1 "secret parent refund conversation" is invisible.
    expect(hits.some((h) => h.callId === refundCallId)).toBe(true);
    const allSegmentsClean = hits.every((h) => !h.snippet.toLowerCase().includes('secret parent'));
    expect(allSegmentsClean).toBe(true);
  });

  it('returns nothing for a blank query', async () => {
    expect(await svc.search(C1, { q: '   ' })).toEqual([]);
  });
});
