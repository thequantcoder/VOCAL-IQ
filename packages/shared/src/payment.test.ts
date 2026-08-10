import { describe, expect, it } from 'vitest';
import { validateNodeConfig } from './flow-node-config.js';
import {
  type PaymentStatus,
  applyRefund,
  assertPciSafe,
  buildReceipt,
  containsCardData,
  formatAmount,
  paymentRequestSchema,
  refundableCents,
  scrubCardData,
} from './payment.js';

// A well-known Luhn-valid test PAN (Visa test number) and a non-card long number.
const CARD = '4242 4242 4242 4242';
const NOT_CARD = '1234 5678 9012 3456'; // fails Luhn

describe('PCI guards (self-audit C)', () => {
  it('containsCardData detects a Luhn-valid PAN, ignores ordinary numbers', () => {
    expect(containsCardData(`my card is ${CARD}`)).toBe(true);
    expect(containsCardData(`order number ${NOT_CARD}`)).toBe(false);
    expect(containsCardData('I want to pay 4200 dollars')).toBe(false);
    expect(containsCardData('')).toBe(false);
  });

  it('scrubCardData redacts a PAN but leaves the rest', () => {
    const out = scrubCardData(`pay with ${CARD} please`);
    expect(out).not.toContain('4242');
    expect(out).toContain('pay with');
    expect(out).toContain('please');
  });

  it('assertPciSafe throws when a card hides in a nested field', () => {
    expect(() => assertPciSafe({ note: 'ok', meta: { deep: `card ${CARD}` } })).toThrow(
      /card data/i,
    );
    expect(() => assertPciSafe({ note: 'all clear', amountCents: 1999 })).not.toThrow();
    expect(() => assertPciSafe(['fine', ['also fine'], 4242])).not.toThrow();
  });
});

describe('paymentRequestSchema', () => {
  it('requires a positive integer amount and normalises currency', () => {
    const p = paymentRequestSchema.parse({ amountCents: 1999, currency: 'usd' });
    expect(p.currency).toBe('USD');
    expect(p.receiptChannel).toBe('none');
    expect(paymentRequestSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ amountCents: 10.5 }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ amountCents: -5 }).success).toBe(false);
  });
});

describe('refund math', () => {
  const base = { amountCents: 1000, refundedCents: 0, status: 'succeeded' as PaymentStatus };

  it('refundableCents never goes negative', () => {
    expect(refundableCents(1000, 400)).toBe(600);
    expect(refundableCents(1000, 1200)).toBe(0);
  });

  it('full refund → refunded', () => {
    const r = applyRefund(base);
    expect(r).toEqual({ ok: true, refundedCents: 1000, status: 'refunded' });
  });

  it('partial refund → partially_refunded, then the rest → refunded', () => {
    const first = applyRefund(base, 300);
    expect(first).toEqual({ ok: true, refundedCents: 300, status: 'partially_refunded' });
    const second = applyRefund({ ...base, refundedCents: 300, status: 'partially_refunded' }, 700);
    expect(second).toEqual({ ok: true, refundedCents: 1000, status: 'refunded' });
  });

  it('rejects over-refund and refunding a non-succeeded payment', () => {
    expect(applyRefund(base, 1500)).toEqual({
      ok: false,
      reason: expect.stringMatching(/exceeds/),
    });
    expect(applyRefund({ ...base, status: 'failed' })).toEqual({
      ok: false,
      reason: expect.stringMatching(/succeeded/),
    });
    expect(applyRefund({ ...base, refundedCents: 1000, status: 'refunded' })).toEqual({
      ok: false,
      reason: expect.stringMatching(/already/),
    });
  });
});

describe('formatting', () => {
  it('formatAmount renders minor units with a symbol', () => {
    expect(formatAmount(1999, 'USD')).toBe('$19.99');
    expect(formatAmount(5000, 'eur')).toBe('€50.00');
    expect(formatAmount(100, 'JPY')).toBe('1.00 JPY'); // no symbol → code suffix
  });

  it('buildReceipt includes amount, description and only last4', () => {
    const r = buildReceipt({
      amountCents: 2500,
      currency: 'USD',
      description: 'Order #42',
      last4: '4242',
      chargeId: 'ch_abc',
    });
    expect(r).toContain('$25.00');
    expect(r).toContain('Order #42');
    expect(r).toContain('4242');
    expect(r).toContain('ch_abc');
    expect(r).not.toContain('4242 4242'); // never a full PAN
  });
});

describe('PAYMENT flow node config', () => {
  it('accepts a fixed-amount payment node', () => {
    const res = validateNodeConfig('PAYMENT', {
      amountSource: 'fixed',
      amountCents: 1999,
      currency: 'USD',
      description: 'Deposit',
    });
    expect(res.valid).toBe(true);
  });
  it('rejects a fixed node with no amount and a variable node with no variable', () => {
    expect(validateNodeConfig('PAYMENT', { amountSource: 'fixed', amountCents: 0 }).valid).toBe(
      false,
    );
    expect(
      validateNodeConfig('PAYMENT', { amountSource: 'variable', amountVariable: '' }).valid,
    ).toBe(false);
  });
});
