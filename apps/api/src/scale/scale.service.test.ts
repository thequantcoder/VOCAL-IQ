import { describe, expect, it } from 'vitest';
import { ScaleService } from './scale.service';
import { InMemoryVectorStore, type VectorStore, cosineSimilarity } from './vector-store';

/**
 * Scale infra (Day 62). Proves multi-region voice routing (self-audit F), backend selection, and
 * the vector-store seam's parity contract (self-audit A) — any backend must reproduce the same
 * cosine ranking + tenant isolation (self-audit B). Pure/in-memory: no external ClickHouse/Qdrant.
 */

describe('ScaleService', () => {
  it('reports operational defaults + single region with no scale env', () => {
    const s = new ScaleService({} as NodeJS.ProcessEnv);
    const st = s.status();
    expect(st.backends.analytics).toBe('timescale');
    expect(st.backends.vectors).toBe('pgvector');
    expect(st.regions).toHaveLength(1);
  });

  it('routes a call to the nearest active voice region', () => {
    const s = new ScaleService({ VOICE_REGIONS: 'us-east,eu-west,ap-south' } as NodeJS.ProcessEnv);
    expect(s.resolveVoiceRegion({ lat: 48.9, lon: 2.4 }).region).toBe('eu-west'); // Paris
    expect(s.resolveVoiceRegion({ lat: 40.7, lon: -74 }).region).toBe('us-east'); // NYC
    expect(s.resolveVoiceRegion(null).mediaHost).toContain('us-east');
  });
});

/** A trivial second implementation to prove any backend satisfying the seam ranks identically. */
class SortingVectorStore implements VectorStore {
  readonly name = 'sorting';
  private items: {
    id: string;
    tenantId: string;
    vector: number[];
    payload?: Record<string, unknown>;
  }[] = [];
  async upsert(items: typeof this.items): Promise<void> {
    this.items.push(...items);
  }
  async search(tenantId: string, vector: number[], topK: number) {
    return this.items
      .filter((i) => i.tenantId === tenantId)
      .map((i) => ({ id: i.id, score: cosineSimilarity(vector, i.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

describe('VectorStore seam parity (self-audit A + B)', () => {
  const items = [
    { id: 'a', tenantId: 't1', vector: [1, 0, 0] },
    { id: 'b', tenantId: 't1', vector: [0.9, 0.1, 0] },
    { id: 'c', tenantId: 't1', vector: [0, 1, 0] },
    { id: 'other', tenantId: 't2', vector: [1, 0, 0] }, // different tenant — must be excluded
  ];

  it('two independent backends produce the same ranking + honor tenant isolation', async () => {
    const a = new InMemoryVectorStore();
    const b = new SortingVectorStore();
    await a.upsert(items);
    await b.upsert(items);

    const query = [1, 0, 0];
    const ra = await a.search('t1', query, 3);
    const rb = await b.search('t1', query, 3);

    expect(ra.map((h) => h.id)).toEqual(['a', 'b', 'c']); // cosine order
    expect(rb.map((h) => h.id)).toEqual(ra.map((h) => h.id)); // parity
    expect(ra.some((h) => h.id === 'other')).toBe(false); // t2 excluded
  });
});
