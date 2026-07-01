import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { chunkText } from './chunk';
import { type Embedder, RagService, type UsageSink } from './rag.service';

/**
 * RAG ingestion + retrieval over pgvector (real Postgres). The headline test is
 * tenant isolation (self-audit B): tenant A's retrieval never sees tenant B's chunks,
 * and RLS hides B's chunks from A even in a raw scan. A deterministic keyword embedder
 * makes similarity ordering predictable without live OpenAI.
 */

const db = new PrismaService();

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const A = '00000000-0000-0000-0000-0000007a0001';
const B = '00000000-0000-0000-0000-0000007a0002';

const KEYWORDS = ['hours', 'refund', 'shipping', 'warranty', 'pricing'];
const fakeEmbed: Embedder = (texts) =>
  Promise.resolve(
    texts.map((t) => {
      const v = new Array<number>(1536).fill(0);
      const lower = t.toLowerCase();
      KEYWORDS.forEach((kw, i) => {
        if (lower.includes(kw)) v[i] = 1;
      });
      v[1535] = 0.01; // keep it non-zero (cosine distance needs a non-zero vector)
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
const rag = new RagService(db, fakeEmbed, usage);

async function mkTenant(id: string, slug: string) {
  await db.admin.tenant.upsert({
    where: { id },
    create: { id, type: 'CUSTOMER', parentTenantId: PLATFORM, name: slug, slug, status: 'ACTIVE' },
    update: {},
  });
}

let kbA = '';
let kbB = '';

beforeAll(async () => {
  await mkTenant(A, 'rag-a');
  await mkTenant(B, 'rag-b');
  kbA = (await rag.createKb(A, { name: 'A KB' })).id;
  kbB = (await rag.createKb(B, { name: 'B KB' })).id;
  await rag.ingestText(A, kbA, 'Our opening hours are nine to five on weekdays.');
  await rag.ingestText(A, kbA, 'Refunds are processed within five business days.');
  await rag.ingestText(B, kbB, 'Tenant B secret: warranty covers two years.');
});

afterAll(async () => {
  await db.admin.knowledgeBase.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [A, B] } } });
});

describe('chunkText', () => {
  it('returns one chunk for short text and overlapping chunks for long text', () => {
    expect(chunkText('short')).toEqual(['short']);
    expect(chunkText('')).toEqual([]);
    const long = chunkText('word '.repeat(500), { size: 200, overlap: 40 });
    expect(long.length).toBeGreaterThan(1);
    expect(long.every((c) => c.length <= 220)).toBe(true);
  });
});

describe('RagService retrieval', () => {
  it('returns the most relevant chunk for a query', async () => {
    const hits = await rag.retrieve(A, kbA, 'what are your opening hours', 1);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content.toLowerCase()).toContain('hours');
    expect(hits[0]?.score).toBeGreaterThan(0.5);
  });

  it('meters embedding cost on ingest', () => {
    const ingestCosts = usage.calls.filter((c) => c.tenantId === A && c.costUsd > 0);
    expect(ingestCosts.length).toBeGreaterThan(0);
  });
});

describe('tenant isolation (self-audit B — CRITICAL)', () => {
  it("A's retrieval never returns B's chunks", async () => {
    const hits = await rag.retrieve(A, kbA, 'warranty coverage', 5);
    expect(hits.every((h) => !h.content.includes('Tenant B secret'))).toBe(true);
  });

  it('RLS hides B chunks from A even in a raw scan', async () => {
    const rows = await db.withTenant(
      A,
      (tx) =>
        tx.$queryRaw<
          { n: bigint }[]
        >`SELECT count(*)::int AS n FROM "KbChunk" WHERE "tenantId" = ${B}::uuid`,
    );
    expect(Number(rows[0]?.n ?? -1)).toBe(0);
  });

  it("querying B's KB from A returns nothing (cross-tenant kbId is invisible)", async () => {
    const hits = await rag.retrieve(A, kbB, 'warranty', 5);
    expect(hits).toHaveLength(0);
  });
});
