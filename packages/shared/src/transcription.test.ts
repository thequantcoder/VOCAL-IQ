import { describe, expect, it } from 'vitest';
import {
  MAX_KEY_TERMS,
  buildCitations,
  cleanSegments,
  cleanTranscript,
  normalizeKeyTerms,
} from './transcription.js';

describe('normalizeKeyTerms', () => {
  it('trims, drops empties, de-dupes case-insensitively, caps count', () => {
    expect(normalizeKeyTerms([' Acme ', 'acme', '', '  ', 'Nexium'])).toEqual(['Acme', 'Nexium']);
    expect(normalizeKeyTerms(Array.from({ length: 200 }, (_, i) => `t${i}`)).length).toBe(
      MAX_KEY_TERMS,
    );
  });
});

describe('cleanTranscript (no-verbatim)', () => {
  it('removes filler words', () => {
    expect(cleanTranscript('Um, I uh want the, you know, refund')).toBe('I want the refund');
  });

  it('collapses immediate repetitions / false starts', () => {
    expect(cleanTranscript('I I want the the product')).toBe('I want the product');
    expect(cleanTranscript('the- the total is due')).toBe('the total is due');
  });

  it('leaves already-clean content untouched (aside from whitespace)', () => {
    expect(cleanTranscript('Your order ships tomorrow.')).toBe('Your order ships tomorrow.');
  });
});

describe('cleanSegments', () => {
  it('cleans each segment and drops ones that were pure filler', () => {
    const out = cleanSegments([
      { speaker: 'agent', text: 'Um, hello there', startMs: 0 },
      { speaker: 'caller', text: 'uh um', startMs: 10 },
      { speaker: 'agent', text: 'How can I help?', startMs: 20 },
    ]);
    expect(out).toEqual([
      { speaker: 'agent', text: 'hello there', startMs: 0 },
      { speaker: 'agent', text: 'How can I help?', startMs: 20 },
    ]);
  });
});

describe('buildCitations', () => {
  it('ranks by score, de-dupes chunks, resolves KB names, snippets content', () => {
    const cites = buildCitations(
      [
        { id: 'c1', content: 'Refunds within 30 days.', score: 0.42, kbId: 'kb1' },
        { id: 'c2', content: 'Shipping is free over $50.', score: 0.9, kbId: 'kb1' },
        { id: 'c1', content: 'dup', score: 0.42, kbId: 'kb1' }, // duplicate id dropped
      ],
      { kb1: 'Policies' },
    );
    expect(cites.map((c) => c.chunkId)).toEqual(['c2', 'c1']); // highest score first
    expect(cites[0]).toMatchObject({ kbId: 'kb1', kbName: 'Policies', score: 0.9 });
    expect(cites[0]?.snippet).toBe('Shipping is free over $50.');
  });

  it('truncates long snippets and tolerates unknown KBs', () => {
    const long = 'x'.repeat(300);
    const [c] = buildCitations([{ id: 'a', content: long, score: 0.1, kbId: 'missing' }]);
    expect(c?.kbName).toBeNull();
    expect((c?.snippet.length ?? 0) <= 160).toBe(true);
    expect(c?.snippet.endsWith('…')).toBe(true);
  });
});
