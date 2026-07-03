import { describe, expect, it } from 'vitest';
import { bestMoment, fuseRankings, queryTokens } from './transcript-search.js';

describe('queryTokens', () => {
  it('lowercases, splits on non-alphanumerics, drops <2 chars, de-dupes', () => {
    expect(queryTokens('Refund the ORDER, a refund?')).toEqual(['refund', 'the', 'order']);
  });
  it('is empty for a blank query', () => {
    expect(queryTokens('  !! ')).toEqual([]);
  });
});

describe('bestMoment (jump-to-moment)', () => {
  const segments = [
    { speaker: 'agent', text: 'Hello, how can I help?', startMs: 0 },
    { speaker: 'caller', text: 'I want a refund on my order', startMs: 4000 },
    { speaker: 'agent', text: 'Sure, I can process that refund now', startMs: 8000 },
  ];

  it('returns the segment with the most query-token hits', () => {
    const m = bestMoment(segments, 'refund order');
    expect(m?.segmentIndex).toBe(1); // "refund" + "order" both present
    expect(m?.startMs).toBe(4000);
    expect(m?.hits).toBe(2);
  });

  it('falls back to ts when startMs is absent', () => {
    const m = bestMoment([{ text: 'shipping was slow', ts: 1200 }], 'shipping');
    expect(m?.startMs).toBe(1200);
  });

  it('returns null when nothing matches or the query is empty', () => {
    expect(bestMoment(segments, 'warranty')).toBeNull();
    expect(bestMoment(segments, '')).toBeNull();
    expect(bestMoment('not-an-array', 'refund')).toBeNull();
  });
});

describe('fuseRankings (RRF hybrid merge)', () => {
  it('ranks an item appearing high in both lists above single-list items', () => {
    const keyword = [
      { callId: 'a', score: 0.9 },
      { callId: 'b', score: 0.5 },
    ];
    const semantic = [
      { callId: 'a', score: 0.8 },
      { callId: 'c', score: 0.7 },
    ];
    const fused = fuseRankings(keyword, semantic);
    expect(fused[0]?.callId).toBe('a'); // in both → highest fused score
    expect(fused.map((f) => f.callId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('is order-driven, not score-scale-driven (cosine vs ts_rank never normalised)', () => {
    // semantic scores are tiny vs keyword — RRF must still rank the shared top item first.
    const keyword = [{ callId: 'x', score: 12.3 }];
    const semantic = [
      { callId: 'y', score: 0.001 },
      { callId: 'x', score: 0.0005 },
    ];
    const fused = fuseRankings(keyword, semantic);
    expect(fused[0]?.callId).toBe('x');
  });
});
