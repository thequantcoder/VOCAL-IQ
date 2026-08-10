import { describe, expect, it } from 'vitest';
import { buildIntelPrompt, parseIntel, segmentsToText } from './post-call.js';

describe('segmentsToText', () => {
  it('flattens speaker-labelled segments and drops empties', () => {
    const segs = [
      { speaker: 'agent', text: 'Hello, how can I help?' },
      { speaker: 'caller', text: 'I need to book an appointment.' },
      { speaker: 'agent', text: '' }, // dropped
      { text: 'unlabelled line' },
    ];
    expect(segmentsToText(segs)).toBe(
      'agent: Hello, how can I help?\ncaller: I need to book an appointment.\nunlabelled line',
    );
  });
  it('handles non-array input', () => {
    expect(segmentsToText(null)).toBe('');
    expect(segmentsToText(undefined)).toBe('');
  });
});

describe('buildIntelPrompt', () => {
  it('asks for strict JSON and includes the transcript (token-capped)', () => {
    const p = buildIntelPrompt('caller: hi');
    expect(p.system).toContain('JSON');
    expect(p.user).toContain('caller: hi');
    const big = buildIntelPrompt('x'.repeat(20_000));
    expect(big.user.length).toBeLessThan(12_100);
  });
});

describe('parseIntel', () => {
  it('parses clean JSON', () => {
    const raw = JSON.stringify({
      summary: 'Caller booked an appointment.',
      keywords: ['appointment', 'booking'],
      topics: ['scheduling'],
      entities: [{ type: 'date', value: 'Tuesday' }],
      sentiment: 'positive',
      followUps: ['send confirmation'],
    });
    const intel = parseIntel(raw);
    expect(intel.summary).toBe('Caller booked an appointment.');
    expect(intel.keywords).toEqual(['appointment', 'booking']);
    expect(intel.entities[0]).toEqual({ type: 'date', value: 'Tuesday' });
    expect(intel.sentiment).toBe('positive');
  });

  it('tolerates code fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"summary":"ok","keywords":["x"]}\n```\nThanks!';
    const intel = parseIntel(raw);
    expect(intel.summary).toBe('ok');
    expect(intel.keywords).toEqual(['x']);
  });

  it('falls back to empty intel on garbage (never throws)', () => {
    const intel = parseIntel('the model refused to answer');
    expect(intel.summary).toBe('');
    expect(intel.keywords).toEqual([]);
    expect(intel.sentiment).toBe('neutral');
  });

  it('drops invalid fields via schema defaults', () => {
    const intel = parseIntel('{"summary":"ok","sentiment":"ecstatic","keywords":"nope"}');
    // invalid sentiment + wrong-typed keywords → whole parse fails validation → empty intel
    expect(intel.sentiment).toBe('neutral');
  });
});
