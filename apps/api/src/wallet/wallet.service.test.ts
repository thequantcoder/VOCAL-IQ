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

const PROMO_CODES = ['WALLET-LAUNCH', 'WALLET-ONCE', 'WALLET-CAP'];

afterEach(async () => {
  await db.admin.creditGrant.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.promoCode.deleteMany({ where: { code: { in: PROMO_CODES } } });
  await db.admin.walletLedger.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [C1, R1] } } });
  // Scope to THIS suite's period so we never clobber another suite's R1→C1 margin (e.g. the
  // super-admin platformOverview test seeds a 2026-08 margin) when the full suite runs in parallel.
  await db.admin.resellerMargin.deleteMany({
    where: { resellerTenantId: R1, childTenantId: C1, period: '2026-07' },
  });
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

describe('promotional / bonus credits (PARITY-08)', () => {
  it('spends promo BEFORE paid and splits the ledger entry (promo vs paid)', async () => {
    await svc.grantCredit(C1, { kind: 'PROMO', amountCents: 300, source: 'test:promo' });
    await svc.topUp(C1, { amountCents: 1000, key: 'seed-promo' });
    expect((await svc.getBalance(C1)).promoCents).toBe(300);

    const res = await svc.debit(C1, { amountCents: 500, key: 'call:promo1' });
    expect(res.promoCents).toBe(300); // promo drained first
    expect(res.paidCents).toBe(200); // remainder from paid balance
    expect(res.chargedCents).toBe(500);

    const state = await svc.getBalance(C1);
    expect(state.balanceCents).toBe(800); // 1000 − 200 paid
    expect(state.promoCents).toBe(0); // grant fully drained
    // The invariant holds: paid balance still equals the ledger sum (promo is off-ledger-balance).
    expect(await svc.ledgerSumCents(C1)).toBe(800);

    const ledger = await db.admin.walletLedger.findFirst({
      where: { tenantId: C1, idempotencyKey: 'call:promo1' },
      select: { amountCents: true, promoCents: true },
    });
    expect(ledger?.amountCents).toBe(-200); // paid portion
    expect(ledger?.promoCents).toBe(300); // promo portion (attribution)
  });

  it('a promo-only charge never touches the paid balance and cannot overdraw', async () => {
    await svc.grantCredit(C1, { kind: 'BONUS', amountCents: 500, source: 'test:bonus' });
    // No top-up: paid balance is 0. A 300¢ charge is fully promo-funded.
    const res = await svc.debit(C1, { amountCents: 300, key: 'call:promoOnly' });
    expect(res.promoCents).toBe(300);
    expect(res.paidCents).toBe(0);
    expect((await svc.getBalance(C1)).balanceCents).toBe(0);
    expect((await svc.getBalance(C1)).promoCents).toBe(200); // 500 − 300 left
    expect(await svc.ledgerSumCents(C1)).toBe(0); // no paid movement
  });

  it('excludes expired and revoked grants from spend', async () => {
    // Expired grant + a revoked grant → neither is spendable.
    await svc.grantCredit(C1, {
      kind: 'PROMO',
      amountCents: 400,
      source: 'test:expired',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    const revoked = await svc.grantCredit(C1, {
      kind: 'MANUAL',
      amountCents: 400,
      source: 'test:revoked',
    });
    await svc.revokeGrant(revoked.id);
    expect((await svc.getBalance(C1)).promoCents).toBe(0);

    await svc.topUp(C1, { amountCents: 100, key: 'seed-exp' });
    const res = await svc.debit(C1, { amountCents: 100, key: 'call:exp' });
    expect(res.promoCents).toBe(0); // neither grant applied
    expect(res.paidCents).toBe(100);
  });

  it('drains grants in soonest-expiry-first order', async () => {
    const soon = await svc.grantCredit(C1, {
      kind: 'PROMO',
      amountCents: 100,
      source: 'test:soon',
      expiresAt: '2030-01-01T00:00:00Z',
    });
    const never = await svc.grantCredit(C1, {
      kind: 'PROMO',
      amountCents: 100,
      source: 'test:never',
    });
    await svc.debit(C1, { amountCents: 150, key: 'call:order' });

    const grants = await svc.listGrants(C1);
    const byId = new Map(grants.map((g) => [g.id, g.remainingCents]));
    expect(byId.get(soon.id)).toBe(0); // expiring one drained first
    expect(byId.get(never.id)).toBe(50); // then the never-expiring one
  });

  it('replaying a promo-funded charge does not double-spend the grant', async () => {
    await svc.grantCredit(C1, { kind: 'PROMO', amountCents: 300, source: 'test:replay' });
    await svc.topUp(C1, { amountCents: 1000, key: 'seed-replay' });
    const first = await svc.debit(C1, { amountCents: 500, key: 'call:dup' });
    const replay = await svc.debit(C1, { amountCents: 500, key: 'call:dup' });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect((await svc.getBalance(C1)).balanceCents).toBe(800); // charged once
    expect((await svc.getBalance(C1)).promoCents).toBe(0); // grant drained once, not below 0
  });

  it('grants are tenant-scoped (self-audit B)', async () => {
    await svc.grantCredit(C1, { kind: 'PROMO', amountCents: 250, source: 'test:scope' });
    expect((await svc.getBalance(C1)).promoCents).toBe(250);
    expect((await svc.getBalance(R1)).promoCents).toBe(0); // untouched
  });

  describe('promo codes', () => {
    it('redeems a code into a grant and enforces the per-tenant limit', async () => {
      await svc.createPromoCode({
        code: 'WALLET-ONCE',
        kind: 'PROMO',
        amountCents: 500,
        perTenantLimit: 1,
      });
      const redeemed = await svc.redeemPromoCode(C1, 'wallet-once'); // case-insensitive
      expect(redeemed.amountCents).toBe(500);
      expect((await svc.getBalance(C1)).promoCents).toBe(500);

      await expect(svc.redeemPromoCode(C1, 'WALLET-ONCE')).rejects.toThrow(/already redeemed/i);
    });

    it('enforces the global maxRedemptions cap across tenants', async () => {
      await svc.createPromoCode({
        code: 'WALLET-CAP',
        kind: 'PROMO',
        amountCents: 100,
        perTenantLimit: 1,
        maxRedemptions: 1,
      });
      await svc.redeemPromoCode(C1, 'WALLET-CAP');
      await expect(svc.redeemPromoCode(R1, 'WALLET-CAP')).rejects.toThrow(/fully redeemed/i);
    });

    it('rejects an unknown or expired code', async () => {
      await expect(svc.redeemPromoCode(C1, 'NOPE-NOPE')).rejects.toThrow(/invalid/i);
      await svc.createPromoCode({
        code: 'WALLET-LAUNCH',
        kind: 'PROMO',
        amountCents: 100,
        perTenantLimit: 1,
        expiresAt: '2020-01-01T00:00:00Z',
      });
      await expect(svc.redeemPromoCode(C1, 'WALLET-LAUNCH')).rejects.toThrow(/expired/i);
    });
  });
});
