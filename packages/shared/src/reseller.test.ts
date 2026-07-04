import { describe, expect, it } from 'vitest';
import { descendantIds, subTenantInputSchema } from './reseller.js';

describe('subTenantInputSchema', () => {
  it('accepts a valid sub-tenant and defaults status to ACTIVE', () => {
    const s = subTenantInputSchema.parse({ name: 'Acme Co', ownerEmail: 'owner@acme.co' });
    expect(s.status).toBe('ACTIVE');
  });
  it('rejects a bad email and a non-kebab slug', () => {
    expect(() => subTenantInputSchema.parse({ name: 'x', ownerEmail: 'nope' })).toThrow();
    expect(() =>
      subTenantInputSchema.parse({ name: 'x', ownerEmail: 'a@b.co', slug: 'Bad Slug' }),
    ).toThrow();
  });
});

describe('descendantIds', () => {
  // reseller R → { A → A1 }, and a SIBLING reseller S → B (must never be reached from R).
  const tenants = [
    { id: 'R', parentTenantId: 'platform' },
    { id: 'A', parentTenantId: 'R' },
    { id: 'A1', parentTenantId: 'A' },
    { id: 'S', parentTenantId: 'platform' },
    { id: 'B', parentTenantId: 'S' },
  ];

  it('returns the root + all descendants (inclusive)', () => {
    expect(descendantIds(tenants, 'R').sort()).toEqual(['A', 'A1', 'R']);
    expect(descendantIds(tenants, 'A').sort()).toEqual(['A', 'A1']);
  });
  it('never escapes into a sibling reseller subtree', () => {
    const ids = descendantIds(tenants, 'R');
    expect(ids).not.toContain('S');
    expect(ids).not.toContain('B');
  });
  it('is cycle-safe', () => {
    const cyclic = [
      { id: 'X', parentTenantId: 'Y' },
      { id: 'Y', parentTenantId: 'X' },
    ];
    expect(descendantIds(cyclic, 'X').sort()).toEqual(['X', 'Y']);
  });
});
