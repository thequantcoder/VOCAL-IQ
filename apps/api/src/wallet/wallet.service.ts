import {
  BillingError,
  type PeriodMargin,
  ValidationError,
  assertSameCurrency,
  computePricingChain,
  reconcilePeriod,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Reseller money engine (Day 53) — the wallet + reconciliation service. THE money-critical path:
 * every mutation is an idempotent, append-only ledger entry (unique idempotency key per tenant),
 * the cached `Wallet.balanceCents` equals the ledger sum, and a debit is ATOMIC + race-safe (a
 * conditional decrement can never overdraw beyond the grace floor). All in integer cents. Reads +
 * writes are RLS-scoped (self-audit B); idempotency + no-double-charge is enforced by the DB
 * unique constraint, not just app logic (self-audit C); the pricing maths is the pure, tested
 * `@vocaliq/shared` engine (self-audit D).
 */

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export interface WalletState {
  balanceCents: number;
  bonusCents: number;
  currency: string;
}

export interface DebitResult {
  balanceCents: number;
  chargedCents: number;
  replayed: boolean;
}

export class WalletService {
  constructor(private readonly db: PrismaService) {}

  private async ensureWallet(tenantId: string, currency = 'USD') {
    return this.db.withTenant(tenantId, (tx) =>
      tx.wallet.upsert({
        where: { tenantId },
        create: { tenantId, currency },
        update: {},
        select: { balanceCents: true, bonusCents: true, currency: true },
      }),
    );
  }

  async getBalance(tenantId: string): Promise<WalletState> {
    return this.ensureWallet(tenantId);
  }

  /** The ledger sum — used to reconcile the cached balance against the append-only truth. */
  async ledgerSumCents(tenantId: string): Promise<number> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.walletLedger.aggregate({ _sum: { amountCents: true } }),
    );
    return rows._sum.amountCents ?? 0;
  }

  /** Idempotent top-up (credit). Replaying the same key returns the current balance, no re-credit. */
  async topUp(
    tenantId: string,
    input: { amountCents: number; key: string; reason?: string; currency?: string },
  ): Promise<WalletState> {
    if (input.amountCents <= 0) throw new ValidationError('Top-up must be positive');
    const wallet = await this.ensureWallet(tenantId, input.currency ?? 'USD');
    if (input.currency) assertSameCurrency(wallet.currency, input.currency);

    try {
      await this.db.withTenant(tenantId, async (tx) => {
        await tx.walletLedger.create({
          data: {
            tenantId,
            amountCents: input.amountCents,
            currency: wallet.currency,
            reason: input.reason ?? 'top_up',
            idempotencyKey: input.key,
          },
        });
        await tx.wallet.update({
          where: { tenantId },
          data: { balanceCents: { increment: input.amountCents } },
        });
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // replay — the credit already posted
    }
    return this.getBalance(tenantId);
  }

  /**
   * Idempotent, atomic, no-overdraw debit. In one transaction: append the ledger entry (its unique
   * key is the idempotency barrier — a replay aborts the tx) then CONDITIONALLY decrement the
   * cached balance (`WHERE balance - amt >= -grace`), which is 0-rows when it would overdraw →
   * throws + rolls back. So parallel debits serialise on the wallet row and can never over-draw.
   */
  async debit(
    tenantId: string,
    input: {
      amountCents: number;
      key: string;
      reason?: string;
      callId?: string;
      graceCents?: number;
      currency?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<DebitResult> {
    const amount = Math.abs(Math.round(input.amountCents));
    if (amount === 0) throw new ValidationError('Debit must be non-zero');
    const grace = Math.abs(input.graceCents ?? 0);
    const wallet = await this.ensureWallet(tenantId, input.currency ?? 'USD');
    if (input.currency) assertSameCurrency(wallet.currency, input.currency);

    try {
      await this.db.withTenant(tenantId, async (tx) => {
        await tx.walletLedger.create({
          data: {
            tenantId,
            amountCents: -amount,
            currency: wallet.currency,
            reason: input.reason ?? 'usage',
            idempotencyKey: input.key,
            ...(input.callId ? { callId: input.callId } : {}),
            ...(input.meta ? { meta: input.meta as object } : {}),
          },
        });
        // Atomic conditional decrement — 0 rows means it would overdraw past the grace floor.
        const affected = await tx.$executeRaw`
          UPDATE "Wallet" SET "balanceCents" = "balanceCents" - ${amount}
          WHERE "tenantId" = ${tenantId}::uuid AND "balanceCents" - ${amount} >= ${-grace}`;
        if (affected === 0) throw new BillingError('Insufficient wallet balance');
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // A charge with this key already posted (replay / concurrent duplicate) — no double-debit.
        const state = await this.getBalance(tenantId);
        return { balanceCents: state.balanceCents, chargedCents: 0, replayed: true };
      }
      throw err;
    }

    const state = await this.getBalance(tenantId);
    return { balanceCents: state.balanceCents, chargedCents: amount, replayed: false };
  }

  /**
   * Charge one call up the pricing chain: cost → wholesale → reseller retail. Debits the customer
   * (retail) from ITS wallet idempotently by call, and accrues the reseller's period margin
   * (revenue = retail, cost = wholesale) — only when the debit actually posts (never on a replay).
   */
  async chargeCall(
    tenantId: string,
    input: {
      callId: string;
      platformCostCents: number;
      wholesaleCents: number;
      retailMarkupBps: number;
      resellerTenantId?: string;
      period: string; // e.g. "2026-07"
      graceCents?: number;
    },
  ): Promise<{ chain: ReturnType<typeof computePricingChain>; result: DebitResult }> {
    const chain = computePricingChain({
      platformCostCents: input.platformCostCents,
      wholesaleCents: input.wholesaleCents,
      retailMarkupBps: input.retailMarkupBps,
    });

    const result = await this.debit(tenantId, {
      amountCents: chain.retailCents,
      key: `call:${input.callId}`,
      reason: 'call_usage',
      callId: input.callId,
      ...(input.graceCents !== undefined ? { graceCents: input.graceCents } : {}),
      meta: chain as unknown as Record<string, unknown>,
    });

    // Accrue reseller margin only on a real (non-replay) charge → idempotent margin.
    if (!result.replayed && input.resellerTenantId) {
      await this.accrueMargin(
        input.resellerTenantId,
        tenantId,
        input.period,
        chain.retailCents,
        chain.wholesaleCents,
      );
    }
    return { chain, result };
  }

  /**
   * Charge one billed OUTCOME (Day 82) — value-based, not per-minute. There is no platform cost, so
   * the outcome price IS the wholesale and retail = wholesale + reseller markup. Idempotent by the
   * outcome `key` (a replay never double-bills), and accrues the reseller margin only on a real
   * charge. Mirrors `chargeCall` so all wallet money movement flows through one audited place.
   */
  async chargeOutcome(
    tenantId: string,
    input: {
      key: string;
      wholesaleCents: number;
      markupBps: number;
      resellerTenantId?: string;
      period?: string;
      reason?: string;
      graceCents?: number;
      meta?: Record<string, unknown>;
    },
  ): Promise<{ chain: ReturnType<typeof computePricingChain>; result: DebitResult }> {
    const chain = computePricingChain({
      platformCostCents: 0,
      wholesaleCents: input.wholesaleCents,
      retailMarkupBps: input.markupBps,
    });
    const result = await this.debit(tenantId, {
      amountCents: chain.retailCents,
      key: input.key,
      reason: input.reason ?? 'outcome_revenue',
      ...(input.graceCents !== undefined ? { graceCents: input.graceCents } : {}),
      meta: (input.meta ?? (chain as unknown)) as Record<string, unknown>,
    });
    if (!result.replayed && input.resellerTenantId && input.period) {
      await this.accrueMargin(
        input.resellerTenantId,
        tenantId,
        input.period,
        chain.retailCents,
        chain.wholesaleCents,
      );
    }
    return { chain, result };
  }

  /**
   * Accrue (or, with negative deltas, REVERSE) a reseller's period margin. ResellerMargin rows span
   * two tenants (reseller + child); the owner client writes this platform accounting ledger, keyed by
   * (reseller, child, period). An UPSERT keyed by the compound unique makes it race-safe (no
   * concurrent-create duplicate). Public so a disputed outcome can reverse the exact margin it accrued.
   */
  async accrueMargin(
    resellerTenantId: string,
    childTenantId: string,
    period: string,
    revenueCents: number,
    costCents: number,
  ): Promise<void> {
    await this.db.admin.resellerMargin.upsert({
      where: {
        resellerTenantId_childTenantId_period: { resellerTenantId, childTenantId, period },
      },
      create: {
        resellerTenantId,
        childTenantId,
        period,
        revenue: revenueCents,
        cost: costCents,
        margin: revenueCents - costCents,
      },
      update: {
        revenue: { increment: revenueCents },
        cost: { increment: costCents },
        margin: { increment: revenueCents - costCents },
      },
    });
  }

  /** Reconcile a reseller's period: sum ResellerMargin rows → revenue/cost/margin (ties to the penny). */
  async reconcile(resellerTenantId: string, period: string): Promise<PeriodMargin> {
    const rows = await this.db.admin.resellerMargin.findMany({
      where: { resellerTenantId, period },
      select: { revenue: true, cost: true },
    });
    return reconcilePeriod(rows.map((r) => ({ revenueCents: r.revenue, costCents: r.cost })));
  }
}
