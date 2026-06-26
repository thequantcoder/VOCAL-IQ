import { describe, expect, it } from 'vitest';
import { createAgentSchema, paginationSchema, updateAgentSchema, zE164, zSlug } from './schemas.js';

describe('primitives', () => {
  it('zSlug accepts valid slugs and rejects bad ones', () => {
    expect(zSlug.safeParse('acme-corp').success).toBe(true);
    expect(zSlug.safeParse('Acme Corp').success).toBe(false);
    expect(zSlug.safeParse('-leading').success).toBe(false);
  });

  it('zE164 enforces E.164 phone format', () => {
    expect(zE164.safeParse('+14155550100').success).toBe(true);
    expect(zE164.safeParse('4155550100').success).toBe(false);
    expect(zE164.safeParse('+0123').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('defaults limit and coerces string limits', () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 25 });
    expect(paginationSchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('rejects out-of-range limits', () => {
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});

describe('agent DTOs (round-trip)', () => {
  it('parses a valid agent and applies the default type', () => {
    const parsed = createAgentSchema.parse({
      name: 'Support Bot',
      persona: 'You are helpful.',
      languages: ['en-US', 'es'],
      turnTimeoutMs: 1500,
    });
    expect(parsed.type).toBe('INBOUND');
    expect(parsed.languages).toEqual(['en-US', 'es']);
  });

  it('rejects an empty languages list and out-of-range turn timeout', () => {
    expect(
      createAgentSchema.safeParse({ name: 'x', persona: '', languages: [], turnTimeoutMs: 1500 })
        .success,
    ).toBe(false);
    expect(
      createAgentSchema.safeParse({ name: 'x', persona: '', languages: ['en'], turnTimeoutMs: 50 })
        .success,
    ).toBe(false);
  });

  it('updateAgentSchema requires at least one field', () => {
    expect(updateAgentSchema.safeParse({}).success).toBe(false);
    expect(updateAgentSchema.safeParse({ name: 'New name' }).success).toBe(true);
  });
});
