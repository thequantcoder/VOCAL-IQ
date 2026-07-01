import { Inject, Injectable } from '@nestjs/common';
import { embeddingCostUsd } from '@vocaliq/provider-router';
import { Capability, NotFoundError, Provider, ValidationError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { chunkText } from './chunk';

/**
 * RAG ingestion + retrieval over pgvector (Day 20). CRITICAL (self-audit B): every write
 * and — especially — every similarity search runs inside `withTenant`, so RLS on KbChunk
 * guarantees a tenant can never read another tenant's chunks even through raw SQL. The
 * embedder is injected (real OpenAI in prod, deterministic fake in tests) and every embed
 * meters cost (golden rule #4, self-audit D).
 */

/** Embed one or more texts → 1536-dim vectors. */
export type Embedder = (texts: string[]) => Promise<number[][]>;
export const EMBEDDER = Symbol('EMBEDDER');

export interface UsageSink {
  record(tenantId: string, units: number, costUsd: number): Promise<void>;
}
export const RAG_USAGE = Symbol('RAG_USAGE');

const EMBED_MODEL = 'text-embedding-3-small';

export interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
  metadata: unknown;
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

@Injectable()
export class RagService {
  constructor(
    private readonly db: PrismaService,
    @Inject(EMBEDDER) private readonly embed: Embedder,
    @Inject(RAG_USAGE) private readonly usage: UsageSink,
  ) {}

  async createKb(
    tenantId: string,
    input: { name: string; agentId?: string; sourceType?: string },
  ): Promise<{ id: string; name: string }> {
    if (!input.name?.trim()) throw new ValidationError('Knowledge base name is required');
    return this.db.withTenant(tenantId, (tx) =>
      tx.knowledgeBase.create({
        data: {
          tenantId,
          name: input.name.trim(),
          sourceType: (input.sourceType as 'TEXT') ?? 'TEXT',
          ...(input.agentId ? { agentId: input.agentId } : {}),
        },
        select: { id: true, name: true },
      }),
    );
  }

  /** Chunk → embed → store (tenant-scoped). Returns the number of chunks ingested. */
  async ingestText(
    tenantId: string,
    kbId: string,
    text: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ chunks: number }> {
    const kb = await this.db.withTenant(tenantId, (tx) =>
      tx.knowledgeBase.findFirst({ where: { id: kbId }, select: { id: true } }),
    );
    if (!kb) throw new NotFoundError('Knowledge base not found');

    const chunks = chunkText(text);
    if (chunks.length === 0) return { chunks: 0 };

    const vectors = await this.embed(chunks);
    const meta = JSON.stringify(metadata);

    await this.db.withTenant(tenantId, async (tx) => {
      for (let i = 0; i < chunks.length; i++) {
        const vec = toVectorLiteral(vectors[i] ?? []);
        // Raw insert: the pgvector column is unsupported by the typed client. RLS still
        // applies (non-superuser app role + tenant GUC set by withTenant).
        await tx.$executeRaw`
          INSERT INTO "KbChunk" (id, "kbId", "tenantId", content, embedding, metadata, "createdAt")
          VALUES (gen_random_uuid(), ${kbId}::uuid, ${tenantId}::uuid, ${chunks[i]},
                  ${vec}::vector, ${meta}::jsonb, now())`;
      }
    });

    // Meter embedding cost (~tokens ≈ chars/4).
    const tokens = chunks.reduce((n, c) => n + Math.ceil(c.length / 4), 0);
    await this.usage.record(tenantId, tokens, embeddingCostUsd(EMBED_MODEL, tokens));
    return { chunks: chunks.length };
  }

  /**
   * Retrieve the top-k most similar chunks to `query` from a KB. RLS-scoped: the search
   * only ever sees this tenant's chunks (self-audit B — proven by the cross-tenant test).
   */
  async retrieve(tenantId: string, kbId: string, query: string, k = 4): Promise<RetrievedChunk[]> {
    const [qv] = await this.embed([query]);
    if (!qv) return [];
    const vec = toVectorLiteral(qv);
    const limit = Math.min(Math.max(k, 1), 20);

    // Meter the query-embedding cost (self-audit D).
    const qTokens = Math.ceil(query.length / 4);
    await this.usage.record(tenantId, qTokens, embeddingCostUsd(EMBED_MODEL, qTokens));

    return this.db.withTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<RetrievedChunk[]>`
        SELECT id::text AS id, content,
               1 - (embedding <=> ${vec}::vector) AS score,
               metadata
        FROM "KbChunk"
        WHERE "kbId" = ${kbId}::uuid AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${limit}`,
    );
  }
}

/** Default env-based OpenAI embedder (prod). Tests inject a deterministic fake. */
export function openAiEmbedder(apiKey: string): Embedder {
  return async (texts: string[]) => {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  };
}

/** Prod usage sink → tenant-scoped UsageRecord (embedding capability). */
export function prismaUsageSink(db: PrismaService): UsageSink {
  return {
    async record(tenantId, units, costUsd) {
      if (units <= 0) return;
      await db.withTenant(tenantId, (tx) =>
        tx.usageRecord.create({
          data: {
            tenantId,
            provider: Provider.OPENAI,
            capability: Capability.EMBEDDING,
            units,
            costUsd,
            byok: false,
          },
        }),
      );
    },
  };
}
