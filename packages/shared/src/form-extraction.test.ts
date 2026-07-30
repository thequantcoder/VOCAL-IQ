import { describe, expect, it } from 'vitest';
import {
  buildFormCollectionBrief,
  buildFormExtractionPrompt,
  parseFormExtraction,
} from './form-extraction.js';
import type { FormField } from './form.js';

/**
 * Voice-side FORM support: the ask-brief (system prompt), the strict-JSON extraction prompt, and the
 * tolerant parse. All pure — the api's FormExtractionService test proves the DB orchestration.
 */

const fields: FormField[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'plan', label: 'Plan', type: 'select', required: false, options: ['Pro', 'Scale'] },
];

describe('buildFormCollectionBrief', () => {
  it('tells the agent what to collect, with type hints + required markers', () => {
    const brief = buildFormCollectionBrief([{ name: 'Signup', fields }]);
    expect(brief).toContain('"Signup"');
    expect(brief).toContain('Full name — required');
    expect(brief).toContain('Email (an email address) — required');
    expect(brief).toContain('Plan (one of: Pro, Scale)');
    expect(brief).toContain('one item at a time');
  });
});

describe('buildFormExtractionPrompt', () => {
  it('lists exact keys + the transcript, and demands JSON-only output', () => {
    const { system, user } = buildFormExtractionPrompt(fields, 'agent: hi\nuser: I am Ada');
    expect(system).toContain('ONLY a JSON object');
    expect(system).toContain('Never guess');
    expect(user).toContain('- full_name: Full name');
    expect(user).toContain('- email: Email (an email address)');
    expect(user).toContain('user: I am Ada');
  });
});

describe('parseFormExtraction', () => {
  it('parses a clean JSON reply into known keys only', () => {
    const values = parseFormExtraction(
      fields,
      '{"full_name":"Ada Lovelace","email":"ada@x.com","junk":"ignored"}',
    );
    expect(values).toEqual({ full_name: 'Ada Lovelace', email: 'ada@x.com' });
  });

  it('tolerates code fences + prose and stringifies scalars, dropping empties', () => {
    const raw = 'Sure! ```json\n{"full_name":"Ada","plan":"Pro","email":""}\n``` done';
    expect(parseFormExtraction(fields, raw)).toEqual({ full_name: 'Ada', plan: 'Pro' });
    expect(
      parseFormExtraction([{ key: 'n', label: 'N', type: 'number', required: false }], '{"n": 42}'),
    ).toEqual({ n: '42' });
  });

  it('returns {} on malformed output (never throws)', () => {
    expect(parseFormExtraction(fields, 'no json here')).toEqual({});
    expect(parseFormExtraction(fields, '{broken')).toEqual({});
    expect(parseFormExtraction(fields, '[1,2]')).toEqual({});
    expect(parseFormExtraction(fields, '{"full_name": {"nested":"x"}}')).toEqual({});
  });
});
