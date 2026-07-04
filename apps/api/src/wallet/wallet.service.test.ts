import { afterEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WalletService } from './wallet.service';

/**
 * Reseller money engine (Day 53) against real Postgres — the money-critical acceptance tests
 * (self-audit D + C + B): idempotent charges never double-debit, N PARALLEL debits sum correctly
 * and never over-draw, the negative-balance guard hard-stops, the pricing chain persists, the
 * cached balance ties out to the ledger, reconciliation is exact, and ledgers are tenant-isolated.
 */

const db = new PrismaService();
const svc = new WalletService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';

afterEach(async () => {
  await db.admin.walletLedger.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.resellerMargin.deleteMany({ where: { resellerTenantId: R1, childTenantId: C1 } });
});

describe('idempotency (no double-debit — self-audit C)', () => {
  it('replaying a charge with the same key debits ONCE', async () => {
    await svc.topUp(C1, { amountCents: 1000, key: 'seed-1' });
    const first = await svc.debit(C1, { amountCents: 150, key: 'call:abc' });
    const replay = await svc.debit(C1, { amountCents: 150, key: 'call:abc' });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.chargedCents).toBe(0);
    expect((await svc.getBalance(C1)).balanceCents).toBe(850); // 1000 − 150 once
  });

  it('replaying a top-up does not re-credit', async () => {
    await svc.topUp(C1, { amountCents: 500, key: 'tu-1' });
    await svc.topUp(C1, { amountCents: 500, key: 'tu-1' });
    expect((await svc.getBalance(C1)).balanceCents).toBe(500);
  });
});

describe('concurrency (parallel debits never over-draw)', () => {
  it('N parallel debits sum correctly and cannot overdraw the wallet', async () => {
    await svc.topUp(C1, { amountCents: 1000, key: 'seed-2' });
    // 15 parallel debits of 100¢ against a 1000¢ balance → exactly 10 succeed, 5 rejected.
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) => svc.debit(C1, { amountCents: 100, key: `p-${i}` })),
    );
    const ok = results.filter(
      (r) => r.status === 'fulfilled' && r.value.chargedCents === 100,
    ).length;
    expect(ok).toBe(10);

    const state = await svc.getBalance(C1);
    expect(state.balanceCents).toBe(0); // never negative, exactly drained
    expect(await svc.ledgerSumCents(C1)).toBe(0); // ledger ties out to the balance
  });
});

describe('negative-balance guard', () => {
  it('hard-stops a debit that would overdraw, but honours the grace floor', async () => {
    await svc.topUp(C1, { amountCents: 100, key: 'seed-3' });
    await expect(svc.debit(C1, { amountCents: 200, key: 'over-1' })).rejects.toThrow(
      /Insufficient/,
    );
    // With grace it succeeds and the balance goes to −100 (within the −150 floor).
    const res = await svc.debit(C1, { amountCents: 200, key: 'over-2', graceCents: 150 });
    expect(res.balanceCents).toBe(-100);
  });
});

describe('pricing chain + reconciliation (self-audit D)', () => {
  it('charges the customer retail, accrues reseller margin, and reconciles to the penny', async () => {
    await svc.topUp(C1, { amountCents: 10_000, key: 'seed-4' });
    // cost 400¢, wholesale 600¢, +50% markup → retail 900¢; margin 300¢, platform rev 200¢.
    const { chain } = await svc.chargeCall(C1, {
      callId: '00000000-0000-0000-0000-0000053a0001',
      platformCostCents: 400,
      wholesaleCents: 600,
      retailMarkupBps: 5000,
      resellerTenantId: R1,
      period: '2026-07',
    });
    expect(chain.retailCents).toBe(900);
    expect((await svc.getBalance(C1)).balanceCents).toBe(9100); // 10000 − 900

    // A replay of the same call must not re-charge or double-accrue margin.
    await svc.chargeCall(C1, {
      callId: '00000000-0000-0000-0000-0000053a0001',
      platformCostCents: 400,
      wholesaleCents: 600,
      retailMarkupBps: 5000,
      resellerTenantId: R1,
      period: '2026-07',
    });
    const margin = await svc.reconcile(R1, '2026-07');
    expect(margin.revenueCents).toBe(900);
    expect(margin.costCents).toBe(600);
    expect(margin.marginCents).toBe(300); // once, not 600
  });
});

describe('per-tenant ledger isolation (self-audit B)', () => {
  it('a debit on one tenant never touches another tenant’s ledger/balance', async () => {
    await svc.topUp(C1, { amountCents: 500, key: 's-c1' });
    await svc.topUp(R1, { amountCents: 700, key: 's-r1' });
    await svc.debit(C1, { amountCents: 100, key: 'd-c1' });

    expect((await svc.getBalance(C1)).balanceCents).toBe(400);
    expect((await svc.getBalance(R1)).balanceCents).toBe(700); // untouched
  });
});
