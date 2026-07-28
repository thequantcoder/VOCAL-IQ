import { createHash } from 'node:crypto';
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
 * Qdrant point ids must be a uint64 or a UUID — our ids are arbitrary strings, so we derive a stable
 * UUID (SHA-256 → RFC-4122-shaped) and keep the original id in the payload. Deterministic, so re-upsert
 * of the same logical id replaces the same point.
 */
function toPointId(id: string): string {
  const h = createHash('sha256').update(id).digest('hex');
  const variant = ((Number.parseInt(h[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Qdrant-backed store (gated) — selected when `QDRANT_URL` is set (with optional `QDRANT_API_KEY`).
 * Points live in one Cosine collection (created lazily from the first vector's dimension); every point
 * carries a `tenantId` payload field and search filters on it, so isolation holds exactly as in-memory.
 * The original string id is preserved in the payload (`__id`) and returned as the hit id. HTTP fail →
 * a typed `ProviderError` (nothing silently loses data). `fetch` is injectable for offline tests.
 */
export class QdrantVectorStore implements VectorStore {
  readonly name = 'qdrant';
  private ensured = false;

  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
    private readonly collection = 'vocaliq',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  /** Create the collection (Cosine, dim from the first vector) on first use; idempotent. */
  private async ensureCollection(dim: number): Promise<void> {
    if (this.ensured) return;
    const existing = await this.fetchImpl(`${this.url}/collections/${this.collection}`, {
      headers: this.headers(false),
    });
    if (!existing.ok) {
      const created = await this.fetchImpl(`${this.url}/collections/${this.collection}`, {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify({ vectors: { size: dim, distance: 'Cosine' } }),
      });
      if (!created.ok) {
        throw new ProviderError(`Qdrant collection create failed (${created.status}).`);
      }
    }
    this.ensured = true;
  }

  async upsert(items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;
    const dim = items[0]?.vector.length ?? 0;
    if (dim === 0) throw new ProviderError('Qdrant upsert requires non-empty vectors.');
    await this.ensureCollection(dim);
    const points = items.map((it) => ({
      id: toPointId(it.id),
      vector: it.vector,
      payload: { ...(it.payload ?? {}), __id: it.id, tenantId: it.tenantId },
    }));
    const res = await this.fetchImpl(
      `${this.url}/collections/${this.collection}/points?wait=true`,
      { method: 'PUT', headers: this.headers(true), body: JSON.stringify({ points }) },
    );
    if (!res.ok) throw new ProviderError(`Qdrant upsert failed (${res.status}).`);
  }

  async search(tenantId: string, vector: number[], topK: number): Promise<VectorHit[]> {
    const res = await this.fetchImpl(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({
        vector,
        limit: Math.max(0, topK),
        filter: { must: [{ key: 'tenantId', match: { value: tenantId } }] },
        with_payload: true,
      }),
    });
    if (!res.ok) throw new ProviderError(`Qdrant search failed (${res.status}).`);
    const body = (await res.json().catch(() => ({}))) as {
      result?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>;
    };
    return (body.result ?? []).map((r) => {
      const payload = { ...(r.payload ?? {}) };
      const origId = typeof payload.__id === 'string' ? payload.__id : String(r.id);
      payload.__id = undefined;
      payload.tenantId = undefined;
      const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
      const hit: VectorHit = { id: origId, score: r.score };
      if (Object.keys(clean).length > 0) hit.payload = clean;
      return hit;
    });
  }
}

/** Select the vector store from env. Qdrant when configured (gated), else the in-memory default. */
export function buildVectorStore(env: NodeJS.ProcessEnv = process.env): VectorStore {
  if (env.QDRANT_URL) return new QdrantVectorStore(env.QDRANT_URL, env.QDRANT_API_KEY);
  return new InMemoryVectorStore();
}
