import { describe, expect, it } from 'vitest';
import {
  type MemoryFact,
  buildMemoryContext,
  isMemoryExpired,
  mergeMemoryFacts,
} from './memory.js';

const fact = (key: string, value: string, kind: MemoryFact['kind'] = 'detail'): MemoryFact => ({
  key,
  value,
  kind,
});

describe('mergeMemoryFacts', () => {
  it('overwrites same-key facts (newest wins) and keeps the rest', () => {
    const existing = [fact('budget', '$500', 'budget'), fact('pet', 'dog')];
    const incoming = [fact('Budget', '$800', 'budget'), fact('timezone', 'PST')];
    const merged = mergeMemoryFacts(existing, incoming);
    const budget = merged.find((f) => f.key.toLowerCase() === 'budget');
    expect(budget?.value).toBe('$800'); // newest wins, case-insensitive key
    expect(merged.some((f) => f.key === 'pet')).toBe(true);
    expect(merged.some((f) => f.key === 'timezone')).toBe(true);
    expect(merged).toHaveLength(3);
  });

  it('caps the fact set', () => {
    const many = Array.from({ length: 80 }, (_, i) => fact(`k${i}`, `v${i}`));
    expect(mergeMemoryFacts([], many).length).toBe(50);
  });
});

describe('buildMemoryContext', () => {
  it('returns empty for a first-time caller (no phantom context)', () => {
    expect(buildMemoryContext({ facts: [] })).toBe('');
    expect(buildMemoryContext({ summary: '   ', facts: [] })).toBe('');
  });

  it('builds an injectable snippet from summary + facts', () => {
    const ctx = buildMemoryContext({
      summary: 'Prefers morning calls.',
      facts: [fact('budget', '$800', 'budget'), fact('objection', 'price', 'objection')],
    });
    expect(ctx).toContain('previous calls');
    expect(ctx).toContain('Prefers morning calls.');
    expect(ctx).toContain('budget: $800');
    expect(ctx).toContain('objection: price');
  });
});

describe('isMemoryExpired (retention)', () => {
  const now = new Date('2026-07-03T00:00:00Z');
  it('keeps forever when retentionDays <= 0 (default policy)', () => {
    const old = new Date('2020-01-01T00:00:00Z');
    expect(isMemoryExpired(old, 0, now)).toBe(false);
    expect(isMemoryExpired(old, -1, now)).toBe(false);
  });
  it('expires memory older than the retention window', () => {
    const d40 = new Date('2026-05-24T00:00:00Z'); // ~40 days before now
    expect(isMemoryExpired(d40, 30, now)).toBe(true);
    expect(isMemoryExpired(d40, 90, now)).toBe(false);
  });
});

describe('memory extraction prompt + parse', () => {
  it('builds a strict-JSON extraction prompt (token-capped)', async () => {
    const { buildMemoryExtractionPrompt } = await import('./memory.js');
    const p = buildMemoryExtractionPrompt('caller: my budget is $500');
    expect(p.system).toContain('JSON');
    expect(p.user).toContain('$500');
    expect(buildMemoryExtractionPrompt('x'.repeat(20_000)).user.length).toBeLessThan(12_100);
  });

  it('parses valid JSON and falls back to empty on garbage', async () => {
    const { parseMemoryExtraction } = await import('./memory.js');
    const ok = parseMemoryExtraction(
      '```json\n{"summary":"Prefers mornings","facts":[{"key":"budget","value":"$500","kind":"budget"}]}\n```',
    );
    expect(ok.summary).toBe('Prefers mornings');
    expect(ok.facts[0]?.value).toBe('$500');
    const bad = parseMemoryExtraction('the model refused');
    expect(bad.summary).toBe('');
    expect(bad.facts).toEqual([]);
  });
});
