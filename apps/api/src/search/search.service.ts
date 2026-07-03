import { embeddingCostUsd } from '@vocaliq/provider-router';
import {
  NotFoundError,
  type SearchMode,
  bestMoment,
  fuseRankings,
  segmentsToText,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { Embedder, UsageSink } from '../rag/rag.service';

/**
 * Transcript search (Day 42): keyword (Postgres FTS), semantic (pgvector), and hybrid
 * (RRF fusion), with jump-to-moment playback. CRITICAL (self-audit B): every read runs
 * inside `withTenant`, so RLS on `Transcript` guarantees a tenant can never see another
 * tenant's calls — even through the raw SQL used for FTS/vector ops. The embedder is
 * injected (real OpenAI in prod, deterministic fake in tests) and every embed meters
 * cost (golden rule #4). FTS works with no embeddings; semantic degrades gracefully.
 */

const EMBED_MODEL = 'text-embedding-3-small';
const MAX_LIMIT = 50;
const EMBED_MAX_CHARS = 8000; // keep the embed input bounded (self-audit F)

export interface SearchHit {
  callId: string;
  agentId: string | null;
  createdAt: string;
  score: number;
  snippet: string;
  /** jump-to-moment: ms offset into the call for playback (0 if no segment matched). */
  startMs: number;
}

interface FtsRow {
  callId: string;
  agentId: string | null;
  createdAt: Date;
  rank: number;
  snippet: string;
  segments: unknown;
}
interface VecRow {
  callId: string;
  agentId: string | null;
  createdAt: Date;
  score: number;
  segments: unknown;
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

export class SearchService {
  constructor(
    private readonly db: PrismaService,
    private readonly embed: Embedder,
    private readonly usage: UsageSink,
  ) {}

  /**
   * Index one transcript for search: flatten its segments to `searchText` (always) and
   * compute an embedding (best-effort — FTS still works without it). Idempotent.
   */
  async indexTranscript(tenantId: string, callId: string): Promise<{ indexed: boolean }> {
    const transcript = await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.findFirst({ where: { callId }, select: { id: true, segments: true } }),
    );
    if (!transcript) throw new NotFoundError('Transcript not found');

    const text = segmentsToText(transcript.segments).slice(0, EMBED_MAX_CHARS * 2);
    if (!text) {
      await this.db.withTenant(
        tenantId,
        (tx) =>
          tx.$executeRaw`UPDATE "Transcript" SET "searchText" = '' WHERE id = ${transcript.id}::uuid`,
      );
      return { indexed: false };
    }

    let vectorLiteral: string | null = null;
    try {
      const [vec] = await this.embed([text.slice(0, EMBED_MAX_CHARS)]);
      if (vec && vec.length > 0) {
        vectorLiteral = toVectorLiteral(vec);
        const tokens = Math.ceil(text.length / 4);
        await this.usage.record(tenantId, tokens, embeddingCostUsd(EMBED_MODEL, tokens));
      }
    } catch {
      // No embedder / key (self-host without OpenAI): keep FTS working, skip semantic.
      vectorLiteral = null;
    }

    await this.db.withTenant(tenantId, async (tx) => {
      if (vectorLiteral) {
        await tx.$executeRaw`
          UPDATE "Transcript" SET "searchText" = ${text}, embedding = ${vectorLiteral}::vector
          WHERE id = ${transcript.id}::uuid`;
      } else {
        await tx.$executeRaw`
          UPDATE "Transcript" SET "searchText" = ${text} WHERE id = ${transcript.id}::uuid`;
      }
    });
    return { indexed: true };
  }

  /** Index every not-yet-indexed transcript for the tenant (backfill / reindex). */
  async reindexTenant(tenantId: string): Promise<{ indexed: number }> {
    const pending = await this.db.withTenant(tenantId, (tx) =>
      tx.transcript.findMany({ where: { searchText: null }, select: { callId: true } }),
    );
    let indexed = 0;
    for (const { callId } of pending) {
      const r = await this.indexTranscript(tenantId, callId);
      if (r.indexed) indexed++;
    }
    return { indexed };
  }

  /**
   * Search transcripts. `mode` = keyword | semantic | hybrid (default). Optional agent
   * filter + date range. Returns tenant-scoped hits with a snippet and a jump-to-moment.
   */
  async search(
    tenantId: string,
    params: {
      q: string;
      mode?: SearchMode;
      agentId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<SearchHit[]> {
    const q = params.q.trim();
    if (!q) return [];
    const mode: SearchMode = params.mode ?? 'hybrid';
    const limit = Math.min(Math.max(params.limit ?? 20, 1), MAX_LIMIT);
    const agentId = params.agentId ?? null;
    const from = params.from ?? null;
    const to = params.to ?? null;

    const wantKeyword = mode === 'keyword' || mode === 'hybrid';
    const wantSemantic = mode === 'semantic' || mode === 'hybrid';

    // Pull a slightly larger candidate pool per source so fusion has room to work.
    const pool = Math.min(limit * 3, MAX_LIMIT);

    const ftsRows: FtsRow[] = wantKeyword
      ? await this.db.withTenant(
          tenantId,
          (tx) =>
            tx.$queryRaw<FtsRow[]>`
            SELECT c.id::text AS "callId", c."agentId"::text AS "agentId", c."createdAt",
                   ts_rank(to_tsvector('english', coalesce(t."searchText", '')),
                           websearch_to_tsquery('english', ${q})) AS rank,
                   ts_headline('english', coalesce(t."searchText", ''),
                               websearch_to_tsquery('english', ${q}),
                               'MaxFragments=1,MaxWords=18,MinWords=6,StartSel=<<,StopSel=>>') AS snippet,
                   t."segments" AS segments
            FROM "Transcript" t JOIN "Call" c ON c.id = t."callId"
            WHERE to_tsvector('english', coalesce(t."searchText", ''))
                  @@ websearch_to_tsquery('english', ${q})
              AND (${agentId}::uuid IS NULL OR c."agentId" = ${agentId}::uuid)
              AND (${from}::timestamptz IS NULL OR c."createdAt" >= ${from})
              AND (${to}::timestamptz IS NULL OR c."createdAt" < ${to})
            ORDER BY rank DESC
            LIMIT ${pool}`,
        )
      : [];

    let vecRows: VecRow[] = [];
    if (wantSemantic) {
      let qVec: number[] | undefined;
      try {
        [qVec] = await this.embed([q]);
      } catch {
        qVec = undefined;
      }
      if (qVec && qVec.length > 0) {
        const vec = toVectorLiteral(qVec);
        const qTokens = Math.ceil(q.length / 4);
        await this.usage.record(tenantId, qTokens, embeddingCostUsd(EMBED_MODEL, qTokens));
        vecRows = await this.db.withTenant(
          tenantId,
          (tx) =>
            tx.$queryRaw<VecRow[]>`
            SELECT c.id::text AS "callId", c."agentId"::text AS "agentId", c."createdAt",
                   1 - (t.embedding <=> ${vec}::vector) AS score,
                   t."segments" AS segments
            FROM "Transcript" t JOIN "Call" c ON c.id = t."callId"
            WHERE t.embedding IS NOT NULL
              AND (${agentId}::uuid IS NULL OR c."agentId" = ${agentId}::uuid)
              AND (${from}::timestamptz IS NULL OR c."createdAt" >= ${from})
              AND (${to}::timestamptz IS NULL OR c."createdAt" < ${to})
            ORDER BY t.embedding <=> ${vec}::vector
            LIMIT ${pool}`,
        );
      }
    }

    // Merge candidate metadata (segments/agent/date) keyed by callId for hit assembly.
    const meta = new Map<
      string,
      { agentId: string | null; createdAt: Date; segments: unknown; snippet?: string }
    >();
    for (const r of ftsRows)
      meta.set(r.callId, {
        agentId: r.agentId,
        createdAt: r.createdAt,
        segments: r.segments,
        snippet: r.snippet,
      });
    for (const r of vecRows)
      if (!meta.has(r.callId))
        meta.set(r.callId, { agentId: r.agentId, createdAt: r.createdAt, segments: r.segments });

    // Rank: single-source lists keep their native order; hybrid uses RRF fusion.
    let orderedIds: string[];
    if (mode === 'keyword') orderedIds = ftsRows.map((r) => r.callId);
    else if (mode === 'semantic') orderedIds = vecRows.map((r) => r.callId);
    else
      orderedIds = fuseRankings(
        ftsRows.map((r) => ({ callId: r.callId, score: r.rank })),
        vecRows.map((r) => ({ callId: r.callId, score: r.score })),
      ).map((f) => f.callId);

    const scoreOf = new Map<string, number>();
    if (mode === 'keyword') for (const r of ftsRows) scoreOf.set(r.callId, r.rank);
    else if (mode === 'semantic') for (const r of vecRows) scoreOf.set(r.callId, r.score);

    return orderedIds.slice(0, limit).map((callId, i) => {
      const m = meta.get(callId);
      const moment = bestMoment(m?.segments, q);
      const snippet =
        m?.snippet?.replace(/<<|>>/g, '') ??
        moment?.text ??
        segmentsToText(m?.segments).slice(0, 140);
      return {
        callId,
        agentId: m?.agentId ?? null,
        createdAt: (m?.createdAt ?? new Date(0)).toISOString(),
        score: scoreOf.get(callId) ?? 1 / (i + 1),
        snippet,
        startMs: moment?.startMs ?? 0,
      };
    });
  }
}
