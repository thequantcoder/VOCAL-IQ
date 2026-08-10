import { describe, expect, it } from 'vitest';
import {
  type OutcomeType,
  canBillOutcome,
  isOutcomeAchieved,
  outcomeCharge,
  outcomeDedupeKey,
  outcomePriceSchema,
  outcomeRefundKey,
  recordOutcomeSchema,
} from './outcome-billing.js';

describe('outcomePriceSchema', () => {
  it('accepts a valid price, rejects a bad markup/amount', () => {
    const p = outcomePriceSchema.parse({ type: 'booking', priceCents: 500, markupBps: 2000 });
    expect(p.active).toBe(true);
    expect(outcomePriceSchema.safeParse({ type: 'booking', priceCents: -1 }).success).toBe(false);
    expect(outcomePriceSchema.safeParse({ type: 'nope', priceCents: 1 }).success).toBe(false);
  });
});

describe('recordOutcomeSchema', () => {
  it('validates the period format', () => {
    expect(
      recordOutcomeSchema.safeParse({ type: 'payment', refId: 'p1', period: '2026-07' }).success,
    ).toBe(true);
    expect(
      recordOutcomeSchema.safeParse({ type: 'payment', refId: 'p1', period: 'July' }).success,
    ).toBe(false);
  });
});

describe('dedupe keys (self-audit C — bill once)', () => {
  it('are stable + distinct per outcome and per direction', () => {
    expect(outcomeDedupeKey('booking', 'a1')).toBe('outcome:booking:a1');
    expect(outcomeRefundKey('booking', 'a1')).toBe('outcome-refund:booking:a1');
    expect(outcomeDedupeKey('booking', 'a1')).not.toBe(outcomeDedupeKey('booking', 'a2'));
    expect(outcomeDedupeKey('booking', 'a1')).not.toBe(outcomeDedupeKey('payment', 'a1'));
  });
});

describe('isOutcomeAchieved (verification — no gaming)', () => {
  it('qualified_lead: only qualified+ statuses', () => {
    for (const s of ['QUALIFIED', 'HOT', 'BOOKED'])
      expect(isOutcomeAchieved('qualified_lead', s)).toBe(true);
    for (const s of ['NEW', 'CONTACTED', 'COLD', 'LOST'])
      expect(isOutcomeAchieved('qualified_lead', s)).toBe(false);
  });
  it('booking: any live appointment, not cancelled', () => {
    for (const s of ['BOOKED', 'RESCHEDULED', 'COMPLETED'])
      expect(isOutcomeAchieved('booking', s)).toBe(true);
    expect(isOutcomeAchieved('booking', 'CANCELLED')).toBe(false);
  });
  it('payment: only succeeded', () => {
    expect(isOutcomeAchieved('payment', 'succeeded')).toBe(true);
    for (const s of ['pending', 'failed', 'refunded'])
      expect(isOutcomeAchieved('payment', s)).toBe(false);
  });
});

describe('outcomeCharge (money math — self-audit D)', () => {
  it('direct tenant (no markup): retail = price, no reseller margin', () => {
    expect(outcomeCharge(1000, 0)).toEqual({
      wholesaleCents: 1000,
      retailCents: 1000,
      resellerMarginCents: 0,
    });
  });
  it('reseller markup: retail = price + markup, margin = retail − wholesale', () => {
    // 20% markup on $10.00 → $12.00 retail, $2.00 reseller margin.
    expect(outcomeCharge(1000, 2000)).toEqual({
      wholesaleCents: 1000,
      retailCents: 1200,
      resellerMarginCents: 200,
    });
  });
  it('integer cents (rounds the markup)', () => {
    // 15% of 333 = 49.95 → 383 retail.
    expect(outcomeCharge(333, 1500).retailCents).toBe(383);
  });
});

describe('canBillOutcome (the gate)', () => {
  const type: OutcomeType = 'booking';
  it('bills an achieved, priced, active outcome', () => {
    expect(
      canBillOutcome({ type, price: { priceCents: 500, active: true }, entityStatus: 'BOOKED' }),
    ).toEqual({ ok: true, priceCents: 500 });
  });
  it('refuses with a typed reason when not priced / inactive / zero / not-found / not-achieved', () => {
    expect(canBillOutcome({ type, price: null, entityStatus: 'BOOKED' })).toMatchObject({
      ok: false,
    });
    expect(
      canBillOutcome({ type, price: { priceCents: 500, active: false }, entityStatus: 'BOOKED' })
        .ok,
    ).toBe(false);
    expect(
      canBillOutcome({ type, price: { priceCents: 0, active: true }, entityStatus: 'BOOKED' }).ok,
    ).toBe(false);
    expect(
      canBillOutcome({ type, price: { priceCents: 500, active: true }, entityStatus: null }).ok,
    ).toBe(false);
    expect(
      canBillOutcome({
        type,
        price: { priceCents: 500, active: true },
        entityStatus: 'CANCELLED',
      }).ok,
    ).toBe(false);
  });
});
