import type { TranscriptSegment } from './post-call.js';

/**
 * Transcript search (Day 42) — the pure core. Heavy retrieval (Postgres FTS + pgvector)
 * lives in the api; these deterministic helpers handle query tokenisation, the
 * jump-to-moment pick (which segment a hit maps to), and the hybrid rank merge that
 * blends keyword + semantic result lists. Kept pure so they're unit-tested without a DB.
 */

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

/** Split a free-text query into lowercased word tokens (≥2 chars), de-duplicated. */
export function queryTokens(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2) seen.add(raw);
  }
  return [...seen];
}

export interface Moment {
  /** ms offset into the call to jump playback to. */
  startMs: number;
  /** the matching segment's text (the snippet shown / spoken). */
  text: string;
  /** index of the segment in the transcript. */
  segmentIndex: number;
  /** how many query tokens the segment contained. */
  hits: number;
}

/**
 * Pick the best "moment" in a transcript for a query: the segment containing the most
 * query tokens (earliest wins ties). Returns null when nothing matches — the caller can
 * fall back to the start of the call. This is what powers click → playback at the moment.
 */
export function bestMoment(segments: unknown, query: string): Moment | null {
  if (!Array.isArray(segments)) return null;
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;

  let best: Moment | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as TranscriptSegment;
    const text = (seg.text ?? '').toString();
    if (!text) continue;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const t of tokens) if (lower.includes(t)) hits++;
    if (hits === 0) continue;
    if (!best || hits > best.hits) {
      best = { startMs: seg.startMs ?? seg.ts ?? 0, text: text.trim(), segmentIndex: i, hits };
      if (hits === tokens.length) break; // can't do better than every token
    }
  }
  return best;
}

// ── Hybrid rank merge ─────────────────────────────────────────────────────────

export interface RankedHit {
  callId: string;
  /** raw score from the source list (FTS rank or cosine similarity). */
  score: number;
}

export interface FusedHit {
  callId: string;
  score: number;
}

/**
 * Reciprocal-rank fusion of a keyword list and a semantic list. RRF is scale-free — it
 * needs only the *order* of each list, so we never have to normalise ts_rank against
 * cosine similarity. `k` damps the contribution of low-ranked items (60 is the common
 * default). Both inputs must already be sorted best-first.
 */
export function fuseRankings(keyword: RankedHit[], semantic: RankedHit[], k = 60): FusedHit[] {
  const score = new Map<string, number>();
  const add = (list: RankedHit[]) => {
    list.forEach((hit, rank) => {
      score.set(hit.callId, (score.get(hit.callId) ?? 0) + 1 / (k + rank + 1));
    });
  };
  add(keyword);
  add(semantic);
  return [...score.entries()]
    .map(([callId, s]) => ({ callId, score: s }))
    .sort((a, b) => b.score - a.score);
}
