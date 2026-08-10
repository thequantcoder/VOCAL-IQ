import { describe, expect, it } from 'vitest';
import {
  applyMarkupBps,
  assertSameCurrency,
  canDebit,
  computePricingChain,
  dedupeLedger,
  ledgerBalance,
  minuteChargeCents,
  reconcilePeriod,
} from './wallet.js';

describe('pricing chain (exact cents — self-audit D)', () => {
  it('cost → wholesale → retail → customer charge, margin + platform revenue', () => {
    // cost 4¢, wholesale 6¢, reseller markup 50% → retail 9¢.
    const c = computePricingChain({
      platformCostCents: 4,
      wholesaleCents: 6,
      retailMarkupBps: 5000,
    });
    expect(c.retailCents).toBe(9); // 6 + 50%
    expect(c.resellerMarginCents).toBe(3); // 9 − 6
    expect(c.platformRevenueCents).toBe(2); // 6 − 4
    // The chain balances: cost + platformRev + resellerMargin = customer charge.
    expect(c.platformCostCents + c.platformRevenueCents + c.resellerMarginCents).toBe(
      c.retailCents,
    );
  });
  it('applyMarkupBps rounds half-up and handles 0%', () => {
    expect(applyMarkupBps(100, 0)).toBe(100);
    expect(applyMarkupBps(100, 2500)).toBe(125); // +25%
    expect(applyMarkupBps(3, 5000)).toBe(5); // 3 + 1.5 = 4.5 → 5 (half-up)
  });
});

describe('minuteChargeCents (partial minutes)', () => {
  it('ceil rounds up to the whole minute; per_second bills the fraction', () => {
    expect(minuteChargeCents(61, 10, 'ceil')).toBe(20); // 2 minutes
    expect(minuteChargeCents(30, 10, 'ceil')).toBe(10); // rounds up to 1 min
    expect(minuteChargeCents(30, 10, 'per_second')).toBe(5); // half a minute
    expect(minuteChargeCents(0, 10)).toBe(0);
  });
});

describe('ledger balance + idempotency', () => {
  const entries = [
    { key: 'topup-1', amountCents: 1000, currency: 'USD' },
    { key: 'call-1', amountCents: -150, currency: 'USD' },
    { key: 'call-1', amountCents: -150, currency: 'USD' }, // REPLAY — must be ignored
  ];
  it('balance = sum of DEDUPED entries (replaying a charge never double-debits)', () => {
    expect(dedupeLedger(entries)).toHaveLength(2);
    expect(ledgerBalance(entries)).toBe(850); // 1000 − 150 (not −300)
  });
});

describe('canDebit (negative-balance guard)', () => {
  it('stops a debit that would overdraw beyond the grace floor', () => {
    expect(canDebit(100, 100)).toBe(true);
    expect(canDebit(100, 101)).toBe(false);
    expect(canDebit(100, 150, 50)).toBe(true); // grace covers the overdraft
    expect(canDebit(100, 151, 50)).toBe(false);
  });
});

describe('reconcilePeriod (ties out to the penny)', () => {
  it('margin = revenue − cost', () => {
    const p = reconcilePeriod([
      { revenueCents: 900, costCents: 600 },
      { revenueCents: 450, costCents: 300 },
    ]);
    expect(p.revenueCents).toBe(1350);
    expect(p.costCents).toBe(900);
    expect(p.marginCents).toBe(450);
  });
  it('handles a refund (negative revenue) without drift', () => {
    const p = reconcilePeriod([
      { revenueCents: 900, costCents: 600 },
      { revenueCents: -900, costCents: -600 }, // full refund
    ]);
    expect(p.marginCents).toBe(0);
  });
});

describe('assertSameCurrency', () => {
  it('accepts same (case-insensitive), rejects a mismatch', () => {
    expect(() => assertSameCurrency('usd', 'USD')).not.toThrow();
    expect(() => assertSameCurrency('USD', 'EUR')).toThrow(/Currency mismatch/);
  });
});
