import { ProviderError } from '@vocaliq/shared';

/**
 * Vector-store seam (Day 62) — the same provider-style abstraction the router uses, applied to
 * vectors. Retrieval logic is written against this interface; pgvector backs it today and Qdrant
 * swaps in for large-scale workloads when `QDRANT_URL` is set (gated), with no change to callers.
 * Every operation is tenant-scoped by the caller (self-audit B). Vectors are cosine-compared.
 */

export interface VectorItem {
  id: string;
  tenantId: string;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface VectorHit {
  id: string;
  score: number; // cosine similarity, higher = closer
  payload?: Record<string, unknown>;
}

export interface VectorStore {
  readonly name: string;
  upsert(items: VectorItem[]): Promise<void>;
  /** Top-K nearest neighbours for `vector` within one tenant. */
  search(tenantId: string, vector: number[], topK: number): Promise<VectorHit[]>;
}

/** Cosine similarity — the shared distance metric so every backend ranks identically (parity). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * In-memory reference store — the parity oracle + a safe default when no external vector DB is
 * configured. Tenant-isolated by construction. Not for production scale (that's pgvector/Qdrant),
 * but it defines the exact ranking every backend must reproduce.
 */
export class InMemoryVectorStore implements VectorStore {
  readonly name = 'in-memory';
  private readonly items = new Map<string, VectorItem>();

  async upsert(items: VectorItem[]): Promise<void> {
    for (const it of items) this.items.set(it.id, it);
  }

  async search(tenantId: string, vector: number[], topK: number): Promise<VectorHit[]> {
    const hits: VectorHit[] = [];
    for (const it of this.items.values()) {
      if (it.tenantId !== tenantId) continue; // tenant isolation
      hits.push({
        id: it.id,
        score: cosineSimilarity(vector, it.vector),
        ...(it.payload ? { payload: it.payload } : {}),
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(0, topK));
  }
}

/**
 * Qdrant-backed store (gated). Selected when `QDRANT_URL` is set; the live HTTP client swaps into
 * this class. Until then it refuses use with a clear error so nothing silently loses data.
 */
export class QdrantVectorStore implements VectorStore {
  readonly name = 'qdrant';
  constructor(private readonly url: string) {}
  async upsert(): Promise<void> {
    throw new ProviderError(
      `Qdrant store not yet wired (${this.url}); set up the client to enable.`,
    );
  }
  async search(): Promise<VectorHit[]> {
    throw new ProviderError('Qdrant store not yet wired.');
  }
}

/** Select the vector store from env. Qdrant when configured (gated), else the in-memory default. */
export function buildVectorStore(env: NodeJS.ProcessEnv = process.env): VectorStore {
  if (env.QDRANT_URL) return new QdrantVectorStore(env.QDRANT_URL);
  return new InMemoryVectorStore();
}
