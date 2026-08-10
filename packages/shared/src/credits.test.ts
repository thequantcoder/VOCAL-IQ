import { describe, expect, it } from 'vitest';
import { allocatePromoCredits, isGrantActive, normalizePromoCode } from './credits.js';

/**
 * Promo-credit pure core (PARITY-08). The spend-order allocation is money-critical, so it is
 * exhaustively unit-tested here (the service just applies the decrements it returns).
 */

describe('allocatePromoCredits — spend order (promo before paid)', () => {
  it('with no grants, the whole amount is the paid remainder', () => {
    const r = allocatePromoCredits([], 500);
    expect(r.allocations).toEqual([]);
    expect(r.promoAppliedCents).toBe(0);
    expect(r.remainderCents).toBe(500);
  });

  it('a single grant partially covers the charge; the rest is paid', () => {
    const r = allocatePromoCredits([{ id: 'g1', remainingCents: 300 }], 500);
    expect(r.allocations).toEqual([{ grantId: 'g1', appliedCents: 300 }]);
    expect(r.promoAppliedCents).toBe(300);
    expect(r.remainderCents).toBe(200);
  });

  it('drains grants in the given order and stops once covered (no over-allocation)', () => {
    const r = allocatePromoCredits(
      [
        { id: 'g1', remainingCents: 100 },
        { id: 'g2', remainingCents: 100 },
        { id: 'g3', remainingCents: 100 },
      ],
      150,
    );
    expect(r.allocations).toEqual([
      { grantId: 'g1', appliedCents: 100 },
      { grantId: 'g2', appliedCents: 50 },
    ]);
    expect(r.promoAppliedCents).toBe(150);
    expect(r.remainderCents).toBe(0);
    // g3 is never touched.
  });

  it('promo fully covers the charge → zero paid remainder', () => {
    const r = allocatePromoCredits([{ id: 'g1', remainingCents: 1000 }], 400);
    expect(r.promoAppliedCents).toBe(400);
    expect(r.remainderCents).toBe(0);
    expect(r.allocations).toEqual([{ grantId: 'g1', appliedCents: 400 }]);
  });

  it('ignores empty/negative slices', () => {
    const r = allocatePromoCredits(
      [
        { id: 'g0', remainingCents: 0 },
        { id: 'gneg', remainingCents: -50 },
        { id: 'g1', remainingCents: 80 },
      ],
      100,
    );
    expect(r.allocations).toEqual([{ grantId: 'g1', appliedCents: 80 }]);
    expect(r.promoAppliedCents).toBe(80);
    expect(r.remainderCents).toBe(20);
  });

  it('a zero charge allocates nothing', () => {
    const r = allocatePromoCredits([{ id: 'g1', remainingCents: 100 }], 0);
    expect(r.allocations).toEqual([]);
    expect(r.promoAppliedCents).toBe(0);
    expect(r.remainderCents).toBe(0);
  });
});

describe('isGrantActive', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  it('is active when unrevoked, unexpired, and with credits left', () => {
    expect(isGrantActive({ remainingCents: 100, expiresAt: null, revokedAt: null }, now)).toBe(
      true,
    );
  });
  it('is inactive when revoked, spent, or expired', () => {
    expect(isGrantActive({ remainingCents: 100, revokedAt: now }, now)).toBe(false);
    expect(isGrantActive({ remainingCents: 0 }, now)).toBe(false);
    expect(isGrantActive({ remainingCents: 100, expiresAt: '2026-07-13T00:00:00Z' }, now)).toBe(
      false,
    );
  });
});

describe('normalizePromoCode', () => {
  it('trims and upper-cases for case-insensitive lookup', () => {
    expect(normalizePromoCode('  launch50 ')).toBe('LAUNCH50');
    expect(normalizePromoCode('Welcome-10')).toBe('WELCOME-10');
  });
});
