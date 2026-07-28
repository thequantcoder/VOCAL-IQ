import { isAppError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { QdrantVectorStore, buildVectorStore } from './vector-store';

/**
 * Offline unit proof of the live Qdrant store: a stubbed `fetch` records each call + returns canned
 * responses, so we assert lazy collection creation, the point-upsert shape (UUID id + tenantId/__id
 * payload), the tenant-filtered search, and the hit mapping — no network, no Qdrant.
 */

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('QdrantVectorStore.upsert', () => {
  it('creates the Cosine collection on first use then upserts points with UUID ids + tenant payload', async () => {
    const fetchImpl = vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (u.endsWith('/collections/vocaliq') && (!init?.method || init.method === 'GET')) {
        return notOk(404); // collection doesn't exist yet
      }
      return ok({ result: { status: 'completed' } });
    }) as unknown as typeof fetch;

    await new QdrantVectorStore('http://qdrant:6333', 'qk', 'vocaliq', fetchImpl).upsert([
      { id: 'doc-1', tenantId: 't1', vector: [0.1, 0.2, 0.3], payload: { text: 'hi' } },
    ]);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    // GET (probe) → PUT create collection (Cosine, dim 3) → PUT points.
    expect(String(calls[0]?.[0])).toBe('http://qdrant:6333/collections/vocaliq');
    const create = calls[1]?.[1] as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(create.method).toBe('PUT');
    expect(create.headers['api-key']).toBe('qk');
    expect(JSON.parse(create.body)).toEqual({ vectors: { size: 3, distance: 'Cosine' } });

    const put = calls[2]?.[1] as { method: string; body: string };
    expect(String(calls[2]?.[0])).toContain('/points?wait=true');
    const point = JSON.parse(put.body).points[0];
    expect(point.id).toMatch(UUID_RE); // arbitrary string id → deterministic UUID
    expect(point.vector).toEqual([0.1, 0.2, 0.3]);
    expect(point.payload).toEqual({ text: 'hi', __id: 'doc-1', tenantId: 't1' });
  });

  it('raises a typed error when Qdrant rejects the upsert', async () => {
    const fetchImpl = (async (url: unknown, init?: { method?: string }) =>
      String(url).endsWith('/collections/vocaliq') && !init?.method
        ? ok({}) // collection exists
        : notOk(500)) as unknown as typeof fetch;
    await expect(
      new QdrantVectorStore('http://q', undefined, 'vocaliq', fetchImpl).upsert([
        { id: 'd', tenantId: 't', vector: [1, 0] },
      ]),
    ).rejects.toSatisfy((e) => isAppError(e));
  });
});

describe('QdrantVectorStore.search', () => {
  it('filters by tenantId and maps results back to the original id + clean payload', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({
        result: [
          { id: 'uuid-a', score: 0.9, payload: { __id: 'doc-1', tenantId: 't1', text: 'hi' } },
          { id: 'uuid-b', score: 0.5, payload: { __id: 'doc-2', tenantId: 't1' } },
        ],
      }),
    ) as unknown as typeof fetch;

    const hits = await new QdrantVectorStore('http://q', undefined, 'vocaliq', fetchImpl).search(
      't1',
      [0.1, 0.2],
      5,
    );
    expect(hits).toEqual([
      { id: 'doc-1', score: 0.9, payload: { text: 'hi' } },
      { id: 'doc-2', score: 0.5 },
    ]);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      body: string;
    };
    const body = JSON.parse(init.body) as {
      filter: { must: Array<{ key: string; match: { value: string } }> };
      limit: number;
    };
    expect(body.filter.must[0]).toEqual({ key: 'tenantId', match: { value: 't1' } });
    expect(body.limit).toBe(5);
  });
});

describe('buildVectorStore', () => {
  it('returns Qdrant when QDRANT_URL is set, in-memory otherwise', () => {
    expect(buildVectorStore({ QDRANT_URL: 'http://q' } as NodeJS.ProcessEnv).name).toBe('qdrant');
    expect(buildVectorStore({} as NodeJS.ProcessEnv).name).toBe('in-memory');
  });
});
