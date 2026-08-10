import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { OutcomeBillingService } from './outcome-billing.service';

/**
 * Outcome-based billing (Day 82) — real Postgres, RLS-scoped. Proves verification (only achieved
 * outcomes bill), no-double-bill (idempotent), reseller markup, dispute refund, and the CRITICAL
 * cross-tenant isolation.
 */

const db = new PrismaService();
const wallet = new WalletService(db);
const svc = new OutcomeBillingService(db, wallet);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000082a0001';
const T2 = '00000000-0000-0000-0000-0000082a0002';
const CONTACT = '00000000-0000-0000-0000-0000082a00c1';
const LEAD_OK = '00000000-0000-0000-0000-0000082a01a1'; // QUALIFIED
const LEAD_NEW = '00000000-0000-0000-0000-0000082a01a2'; // NEW (not achieved)
const APPT = '00000000-0000-0000-0000-0000082a01b1'; // BOOKED
const PAYMENT = '00000000-0000-0000-0000-0000082a01d1'; // succeeded
const LEAD_R = '00000000-0000-0000-0000-0000082a01a3'; // QUALIFIED — for the reseller-margin test

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Outcome ${id.slice(-4)}`,
        slug: `outcome-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.contact.upsert({
    where: { id: CONTACT },
    create: { id: CONTACT, tenantId: T, phone: '+15551230000' },
    update: {},
  });
  await db.admin.lead.upsert({
    where: { id: LEAD_OK },
    create: { id: LEAD_OK, tenantId: T, contactId: CONTACT, status: 'QUALIFIED' },
    update: { status: 'QUALIFIED' },
  });
  await db.admin.lead.upsert({
    where: { id: LEAD_NEW },
    create: { id: LEAD_NEW, tenantId: T, contactId: CONTACT, status: 'NEW' },
    update: { status: 'NEW' },
  });
  await db.admin.lead.upsert({
    where: { id: LEAD_R },
    create: { id: LEAD_R, tenantId: T, contactId: CONTACT, status: 'QUALIFIED' },
    update: { status: 'QUALIFIED' },
  });
  await db.admin.appointment.upsert({
    where: { id: APPT },
    create: {
      id: APPT,
      tenantId: T,
      contactId: CONTACT,
      startsAt: new Date('2026-07-01T15:00:00Z'),
      endsAt: new Date('2026-07-01T15:30:00Z'),
      status: 'BOOKED',
    },
    update: { status: 'BOOKED' },
  });
  await db.admin.payment.upsert({
    where: { id: PAYMENT },
    create: { id: PAYMENT, tenantId: T, amountCents: 9900, status: 'succeeded' },
    update: { status: 'succeeded' },
  });
  // Fund T's wallet so outcomes can be charged.
  await wallet.topUp(T, { amountCents: 1_000_000, key: `seed-${Date.now()}` });
});

afterAll(async () => {
  await db.admin.billableOutcome.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.outcomePrice.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.walletLedger.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.payment.deleteMany({ where: { id: PAYMENT } });
  await db.admin.appointment.deleteMany({ where: { id: APPT } });
  await db.admin.resellerMargin.deleteMany({ where: { childTenantId: { in: [T, T2] } } });
  await db.admin.lead.deleteMany({ where: { id: { in: [LEAD_OK, LEAD_NEW, LEAD_R] } } });
  await db.admin.contact.deleteMany({ where: { id: CONTACT } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('OutcomeBillingService pricing', () => {
  it('sets + lists outcome prices', async () => {
    await svc.setPrice(T, { type: 'qualified_lead', priceCents: 250 });
    await svc.setPrice(T, { type: 'booking', priceCents: 500 });
    await svc.setPrice(T, { type: 'payment', priceCents: 100, markupBps: 2000 });
    const prices = await svc.prices(T);
    expect(prices.find((p) => p.type === 'booking')?.priceCents).toBe(500);
  });
});

describe('OutcomeBillingService.recordOutcome (verify + bill — self-audit C/D)', () => {
  it('bills a QUALIFIED lead and debits the wallet by retail', async () => {
    const before = (await wallet.getBalance(T)).balanceCents;
    const o = await svc.recordOutcome(T, { type: 'qualified_lead', refId: LEAD_OK });
    expect(o.status).toBe('billed');
    expect(o.retailCents).toBe(250);
    const after = (await wallet.getBalance(T)).balanceCents;
    expect(before - after).toBe(250);
  });

  it('never double-bills the same outcome (idempotent — self-audit C)', async () => {
    const before = (await wallet.getBalance(T)).balanceCents;
    const again = await svc.recordOutcome(T, { type: 'qualified_lead', refId: LEAD_OK });
    expect(again.retailCents).toBe(250); // same record
    const after = (await wallet.getBalance(T)).balanceCents;
    expect(after).toBe(before); // wallet untouched on the replay
  });

  it('applies reseller markup: retail = price + markup', async () => {
    const o = await svc.recordOutcome(T, { type: 'payment', refId: PAYMENT });
    expect(o.priceCents).toBe(100);
    expect(o.retailCents).toBe(120); // 20% markup
    expect(o.resellerMarginCents).toBe(20);
  });

  it('refuses to bill an outcome that did not happen (self-audit C)', async () => {
    await expect(
      svc.recordOutcome(T, { type: 'qualified_lead', refId: LEAD_NEW }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('refuses when no price is configured', async () => {
    // A booking price exists, but delete it to simulate no price.
    await db.admin.outcomePrice.deleteMany({ where: { tenantId: T, type: 'booking' } });
    await expect(svc.recordOutcome(T, { type: 'booking', refId: APPT })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    await svc.setPrice(T, { type: 'booking', priceCents: 500 }); // restore
  });
});

describe('OutcomeBillingService.dispute', () => {
  it('refunds the wallet and marks the outcome refunded; re-dispute is refused', async () => {
    const o = await svc.recordOutcome(T, { type: 'booking', refId: APPT });
    const beforeRefund = (await wallet.getBalance(T)).balanceCents;
    const disputed = await svc.dispute(T, o.id, 'customer complaint');
    expect(disputed.status).toBe('refunded');
    const afterRefund = (await wallet.getBalance(T)).balanceCents;
    expect(afterRefund - beforeRefund).toBe(o.retailCents); // credited back

    await expect(svc.dispute(T, o.id)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });
});

describe('OutcomeBillingService reseller margin (self-audit D)', () => {
  it('accrues reseller margin on charge and REVERSES it exactly on dispute', async () => {
    await svc.setPrice(T, { type: 'qualified_lead', priceCents: 250, markupBps: 4000 }); // 40% markup
    const o = await svc.recordOutcome(T, {
      type: 'qualified_lead',
      refId: LEAD_R,
      resellerTenantId: T2,
      period: '2026-07',
    });
    expect(o.retailCents).toBe(350); // 250 + 40%
    expect(o.resellerMarginCents).toBe(100);

    const accrued = await db.admin.resellerMargin.findFirst({
      where: { resellerTenantId: T2, childTenantId: T, period: '2026-07' },
      select: { margin: true },
    });
    expect(accrued?.margin).toBe(100);

    await svc.dispute(T, o.id);
    const reversed = await db.admin.resellerMargin.findFirst({
      where: { resellerTenantId: T2, childTenantId: T, period: '2026-07' },
      select: { margin: true, revenue: true },
    });
    expect(reversed?.margin).toBe(0); // dispute is the exact inverse of the charge
    expect(reversed?.revenue).toBe(0);
  });
});

describe('OutcomeBillingService tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant can neither see nor bill another tenant’s outcome', async () => {
    // T2 has no price + can't see T's entities (RLS) → recording T's lead refId fails.
    await svc.setPrice(T2, { type: 'qualified_lead', priceCents: 999 });
    await expect(
      svc.recordOutcome(T2, { type: 'qualified_lead', refId: LEAD_OK }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
    // T2 never sees T's billed outcomes.
    expect(await svc.list(T2)).toEqual([]);
  });
});
