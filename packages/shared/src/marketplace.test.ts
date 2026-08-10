import { describe, expect, it } from 'vitest';
import {
  type ListingStatus,
  addRating,
  canTransitionListing,
  isPurchasable,
  listingInputSchema,
  payoutKey,
  purchaseKey,
  revShareSplit,
} from './marketplace.js';

describe('listingInputSchema', () => {
  it('requires a title + valid agent id', () => {
    expect(
      listingInputSchema.safeParse({
        sourceAgentId: '00000000-0000-0000-0000-000000000001',
        title: 'Great Agent',
        priceCents: 5000,
      }).success,
    ).toBe(true);
    expect(
      listingInputSchema.safeParse({ sourceAgentId: 'x', title: 'ok', priceCents: 1 }).success,
    ).toBe(false);
    expect(
      listingInputSchema.safeParse({
        sourceAgentId: '00000000-0000-0000-0000-000000000001',
        title: 'no',
        priceCents: 1,
      }).success,
    ).toBe(false); // title < 3
  });
});

describe('review/approval state machine (self-audit C)', () => {
  it('only allows the legal transitions', () => {
    expect(canTransitionListing('draft', 'pending')).toBe(true);
    expect(canTransitionListing('pending', 'approved')).toBe(true);
    expect(canTransitionListing('pending', 'rejected')).toBe(true);
    expect(canTransitionListing('approved', 'delisted')).toBe(true);
    expect(canTransitionListing('rejected', 'draft')).toBe(true);
    // illegal jumps
    expect(canTransitionListing('draft', 'approved')).toBe(false);
    expect(canTransitionListing('delisted', 'approved')).toBe(false);
    expect(canTransitionListing('approved', 'pending')).toBe(false);
  });
  it('only approved listings are purchasable', () => {
    const statuses: ListingStatus[] = ['draft', 'pending', 'approved', 'rejected', 'delisted'];
    expect(statuses.filter(isPurchasable)).toEqual(['approved']);
  });
});

describe('revShareSplit (self-audit D — exact, sums to price)', () => {
  it('splits by the creator basis points', () => {
    expect(revShareSplit(10000, 7000)).toEqual({
      priceCents: 10000,
      creatorCents: 7000,
      platformCents: 3000,
    });
  });
  it('the platform gets the exact remainder (no rounding leak)', () => {
    // 333 * 70% = 233.1 → creator 233, platform 100; sum = 333.
    const s = revShareSplit(333, 7000);
    expect(s.creatorCents + s.platformCents).toBe(333);
    expect(s.creatorCents).toBe(233);
    expect(s.platformCents).toBe(100);
  });
  it('sums to price for a spread of odd values (property)', () => {
    for (const price of [1, 7, 99, 100, 12345, 999999]) {
      for (const bps of [0, 1, 2500, 3333, 6667, 9999, 10000]) {
        const s = revShareSplit(price, bps);
        expect(s.creatorCents + s.platformCents).toBe(price);
        expect(s.creatorCents).toBeGreaterThanOrEqual(0);
        expect(s.platformCents).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('clamps out-of-range bps + a free listing', () => {
    expect(revShareSplit(1000, 20000).creatorCents).toBe(1000); // clamped to 100%
    expect(revShareSplit(1000, -5).creatorCents).toBe(0);
    expect(revShareSplit(0, 7000)).toEqual({ priceCents: 0, creatorCents: 0, platformCents: 0 });
  });
});

describe('idempotency keys', () => {
  it('are stable + distinct per buyer/listing', () => {
    expect(purchaseKey('b1', 'l1')).toBe('purchase:b1:l1');
    expect(payoutKey('l1', 'b1')).toBe('payout:l1:b1');
    expect(purchaseKey('b1', 'l1')).not.toBe(purchaseKey('b2', 'l1'));
  });
});

describe('addRating', () => {
  it('folds a new rating into the running average', () => {
    expect(addRating(0, 0, 5)).toEqual({ avg: 5, count: 1 });
    expect(addRating(5, 1, 3)).toEqual({ avg: 4, count: 2 });
    expect(addRating(4, 2, 5)).toEqual({ avg: 4.33, count: 3 }); // (4*2+5)/3 = 4.333
  });
});
