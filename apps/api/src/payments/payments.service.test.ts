import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import {
  type CaptureOutcome,
  DisabledPciCaptureProvider,
  PaymentsService,
  type PciCaptureProvider,
  type ReceiptSender,
} from './payments.service';

/**
 * Pay-by-voice (Day 78) — real Postgres, RLS-scoped. Proves: a card number never reaches the store
 * (PCI, self-audit C), idempotent charges (no double-charge — D), refund transitions, receipts, and
 * the CRITICAL cross-tenant isolation (a tenant can never read/refund another's payment — B).
 */

const db = new PrismaService();

class StubPci implements PciCaptureProvider {
  readonly enabled = true;
  charges = 0;
  refunds: number[] = [];
  async captureAndCharge(_input: {
    tenantId: string;
    amountCents: number;
    currency: string;
    description?: string;
  }): Promise<CaptureOutcome> {
    this.charges++;
    return {
      chargeId: `ch_${this.charges}`,
      token: 'tok_secret',
      last4: '4242',
      status: 'succeeded',
    };
  }
  async refund(input: { amountCents: number }): Promise<void> {
    this.refunds.push(input.amountCents);
  }
}

class StubReceipt implements ReceiptSender {
  readonly enabled = true;
  sent: { channel: string; to: string; body: string }[] = [];
  async send(input: { channel: 'email' | 'sms'; to: string; body: string }): Promise<void> {
    this.sent.push(input);
  }
}

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000078a0001';
const T2 = '00000000-0000-0000-0000-0000078a0002';

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Pay ${id.slice(-4)}`,
        slug: `pay-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
});

afterAll(async () => {
  await db.admin.payment.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('PaymentsService.charge', () => {
  it('charges via the PCI provider and stores only ref/last4 — never a PAN or the token', async () => {
    const pci = new StubPci();
    const svc = new PaymentsService(db, pci, new StubReceipt());
    const p = await svc.charge(T, { amountCents: 1999, currency: 'usd', description: 'Deposit' });
    expect(p.status).toBe('succeeded');
    expect(p.last4).toBe('4242');
    expect(p.providerRef).toBe('ch_1');
    expect('token' in p).toBe(false); // token is never exposed via the API select
    expect(pci.charges).toBe(1);
  });

  it('refuses to store card data hidden in the description (self-audit C)', async () => {
    const svc = new PaymentsService(db, new StubPci(), new StubReceipt());
    await expect(
      svc.charge(T, { amountCents: 500, description: 'card 4242 4242 4242 4242' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('refuses cleanly when no PCI provider is configured (gated)', async () => {
    const svc = new PaymentsService(
      db,
      new DisabledPciCaptureProvider(),
      new DisabledReceiptSenderLocal(),
    );
    await expect(svc.charge(T, { amountCents: 999 })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('is idempotent — the same key never charges twice (sequential)', async () => {
    const pci = new StubPci();
    const svc = new PaymentsService(db, pci, new StubReceipt());
    const key = `order-${Date.now()}`;
    const first = await svc.charge(T, { amountCents: 2500, idempotencyKey: key });
    const second = await svc.charge(T, { amountCents: 2500, idempotencyKey: key });
    expect(second.id).toBe(first.id);
    expect(pci.charges).toBe(1); // provider hit once
  });

  it('never double-charges under a concurrent retry (reserve-key-first — self-audit D)', async () => {
    const pci = new StubPci();
    const svc = new PaymentsService(db, pci, new StubReceipt());
    const key = `race-${Date.now()}`;
    const [a, b] = await Promise.all([
      svc.charge(T, { amountCents: 3000, idempotencyKey: key }),
      svc.charge(T, { amountCents: 3000, idempotencyKey: key }),
    ]);
    expect(a.id).toBe(b.id); // both resolve to the one reserved payment
    expect(pci.charges).toBe(1); // the provider was charged exactly once
  });

  it('sends a receipt when a channel + destination + sender are configured', async () => {
    const receipt = new StubReceipt();
    const svc = new PaymentsService(db, new StubPci(), receipt);
    const p = await svc.charge(T, {
      amountCents: 4200,
      receiptChannel: 'email',
      receiptTo: 'buyer@example.com',
    });
    expect(p.receiptSentAt).not.toBeNull();
    expect(receipt.sent).toHaveLength(1);
    expect(receipt.sent[0]?.body).toContain('$42.00');
    expect(receipt.sent[0]?.body).toContain('4242'); // last4 only
  });
});

describe('PaymentsService.refund', () => {
  it('supports partial then full refund, and rejects over-refund', async () => {
    const pci = new StubPci();
    const svc = new PaymentsService(db, pci, new StubReceipt());
    const p = await svc.charge(T, { amountCents: 1000 });
    const partial = await svc.refund(T, p.id, { amountCents: 300 });
    expect(partial.status).toBe('partially_refunded');
    expect(partial.refundedCents).toBe(300);
    await expect(svc.refund(T, p.id, { amountCents: 900 })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    const full = await svc.refund(T, p.id, {});
    expect(full.status).toBe('refunded');
    expect(full.refundedCents).toBe(1000);
    expect(pci.refunds).toEqual([300, 700]);
  });

  it('a retried refund with the same key never refunds twice (self-audit D)', async () => {
    const pci = new StubPci();
    const svc = new PaymentsService(db, pci, new StubReceipt());
    const p = await svc.charge(T, { amountCents: 1000 });
    const key = `refund-${Date.now()}`;
    const first = await svc.refund(T, p.id, { amountCents: 400, idempotencyKey: key });
    const retry = await svc.refund(T, p.id, { amountCents: 400, idempotencyKey: key });
    expect(retry.refundedCents).toBe(400); // unchanged — the retry was a no-op
    expect(retry.id).toBe(first.id);
    expect(pci.refunds).toEqual([400]); // the provider was refunded exactly once
  });
});

describe('PaymentsService tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant can never read or refund another tenant’s payment', async () => {
    const svc = new PaymentsService(db, new StubPci(), new StubReceipt());
    const p = await svc.charge(T, { amountCents: 1500 });

    await expect(svc.get(T2, p.id)).rejects.toThrow(/not found/i);
    expect(await svc.list(T2)).toEqual([]);
    await expect(svc.refund(T2, p.id, {})).rejects.toThrow(/not found/i);
  });
});

/** Local disabled receipt sender for the gated-charge test (charge fails before receipts anyway). */
class DisabledReceiptSenderLocal implements ReceiptSender {
  readonly enabled = false;
  async send(): Promise<void> {}
}
