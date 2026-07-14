import type { GrantKind } from '@vocaliq/db';
import {
  BillingError,
  type CreatePromoCodeInput,
  type GrantCreditInput,
  NotFoundError,
  type PeriodMargin,
  ValidationError,
  allocatePromoCredits,
  assertSameCurrency,
  computePricingChain,
  normalizePromoCode,
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

/** Prisma P2025 = an update/delete targeted a row that does not exist. */
const isRecordNotFound = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025';

export interface WalletState {
  /** Paid, prepaid balance (cached; = sum of ledger `amountCents`). */
  balanceCents: number;
  /** Legacy Day-49 perk bucket (untouched by the ledger charge path). */
  bonusCents: number;
  /** Promotional / bonus credits from active grants — spent BEFORE `balanceCents` (PARITY-08). */
  promoCents: number;
  currency: string;
}

export interface DebitResult {
  balanceCents: number;
  /** Total charged (promo + paid). */
  chargedCents: number;
  /** Portion funded from promo/bonus grants. */
  promoCents: number;
  /** Portion funded from the paid balance. */
  paidCents: number;
  replayed: boolean;
}

/** A tenant's credit grant as shown in the wallet UI. */
export interface CreditGrantRow {
  id: string;
  kind: GrantKind;
  source: string;
  amountCents: number;
  remainingCents: number;
  currency: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
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
    const [wallet, promoCents] = await Promise.all([
      this.ensureWallet(tenantId),
      this.activePromoCents(tenantId),
    ]);
    return {
      balanceCents: wallet.balanceCents,
      bonusCents: wallet.bonusCents,
      promoCents,
      currency: wallet.currency,
    };
  }

  /**
   * Sum of unexpired, unrevoked, unspent promo/bonus grants — the promo balance shown to the tenant.
   * Filtered to THIS tenant explicitly (not the RLS subtree): a reseller's own wallet must not include
   * its sub-tenants' grants (RLS would otherwise allow the descendants — golden rule #1: RLS AND an
   * application-layer guard).
   */
  async activePromoCents(tenantId: string): Promise<number> {
    const agg = await this.db.withTenant(tenantId, (tx) =>
      tx.creditGrant.aggregate({
        _sum: { remainingCents: true },
        where: {
          tenantId,
          revokedAt: null,
          remainingCents: { gt: 0 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    );
    return agg._sum.remainingCents ?? 0;
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
   * Idempotent, atomic, no-overdraw debit with promo-before-paid spend order (PARITY-08). In ONE
   * transaction: (1) lock the tenant's active promo/bonus grants (`FOR UPDATE`, soonest-expiry first)
   * and allocate the charge against them; (2) append the ledger entry — its unique key is the
   * idempotency barrier, and it records the PAID portion as `amountCents` (so `balance = Σ amountCents`
   * still holds) and the promo portion as `promoCents`; (3) decrement the allocated grants; (4)
   * CONDITIONALLY decrement the paid balance for the remainder (`WHERE balance - rem >= -grace`),
   * which is 0-rows when it would overdraw → throws + rolls back the WHOLE charge (no partial spend).
   * The only work before the barrier is a `FOR UPDATE` lock (no mutation), so a replay still aborts
   * before any state changes. Concurrent debits serialise on the grant + wallet rows, so promo can
   * never be double-spent and the balance can never over-draw.
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

    let promoApplied = 0;
    let paidApplied = amount;
    try {
      await this.db.withTenant(tenantId, async (tx) => {
        // 1. Lock the active grants (soonest expiry, then oldest) and allocate promo BEFORE paid.
        const grants = await tx.$queryRaw<{ id: string; remainingCents: number }[]>`
          SELECT id, "remainingCents" FROM "CreditGrant"
          WHERE "tenantId" = ${tenantId}::uuid AND "revokedAt" IS NULL AND "remainingCents" > 0
            AND "currency" = ${wallet.currency}
            AND ("expiresAt" IS NULL OR "expiresAt" > now())
          ORDER BY "expiresAt" ASC NULLS LAST, "createdAt" ASC
          FOR UPDATE`;
        const alloc = allocatePromoCredits(grants, amount);
        promoApplied = alloc.promoAppliedCents;
        paidApplied = alloc.remainderCents;

        // 2. Barrier: ledger entry (unique key). PAID portion = amountCents; PROMO portion = promoCents.
        await tx.walletLedger.create({
          data: {
            tenantId,
            amountCents: -paidApplied,
            promoCents: promoApplied,
            currency: wallet.currency,
            reason: input.reason ?? 'usage',
            idempotencyKey: input.key,
            ...(input.callId ? { callId: input.callId } : {}),
            ...(input.meta ? { meta: input.meta as object } : {}),
          },
        });

        // 3. Decrement the allocated grants (each row is locked from step 1).
        for (const a of alloc.allocations) {
          await tx.$executeRaw`
            UPDATE "CreditGrant" SET "remainingCents" = "remainingCents" - ${a.appliedCents}
            WHERE id = ${a.grantId}::uuid`;
        }

        // 4. Atomic conditional decrement of the paid remainder — 0 rows = would overdraw the grace floor.
        if (paidApplied > 0) {
          const affected = await tx.$executeRaw`
            UPDATE "Wallet" SET "balanceCents" = "balanceCents" - ${paidApplied}
            WHERE "tenantId" = ${tenantId}::uuid AND "balanceCents" - ${paidApplied} >= ${-grace}`;
          if (affected === 0) throw new BillingError('Insufficient wallet balance');
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // A charge with this key already posted (replay / concurrent duplicate) — no double-debit.
        const state = await this.getBalance(tenantId);
        return {
          balanceCents: state.balanceCents,
          chargedCents: 0,
          promoCents: 0,
          paidCents: 0,
          replayed: true,
        };
      }
      throw err;
    }

    const state = await this.getBalance(tenantId);
    return {
      balanceCents: state.balanceCents,
      chargedCents: amount,
      promoCents: promoApplied,
      paidCents: paidApplied,
      replayed: false,
    };
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

  // ── Promotional / bonus credits (PARITY-08) ──────────────────────────────────

  /**
   * A tenant's grants (active + historical), newest first, for the wallet UI. Filtered to THIS tenant
   * (not the RLS subtree) so a reseller sees only its OWN grants here (golden rule #1: RLS + guard).
   */
  async listGrants(tenantId: string): Promise<CreditGrantRow[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.creditGrant.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          kind: true,
          source: true,
          amountCents: true,
          remainingCents: true,
          currency: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Grant bonus credits to a tenant (an operator action — super-admin platform-wide, or a reseller to
   * a sub-tenant; the CALLER enforces authorization). Owner client: a grant is a privileged, audited
   * write into a tenant's account. Never withdraws as cash — it only ever funds usage before paid credits.
   */
  async grantCredit(
    tenantId: string,
    input: GrantCreditInput,
    opts: { createdBy?: string } = {},
  ): Promise<{ id: string; amountCents: number; remainingCents: number }> {
    const currency = (await this.ensureWallet(tenantId)).currency;
    return this.db.admin.creditGrant.create({
      data: {
        tenantId,
        kind: input.kind,
        source: input.source,
        amountCents: input.amountCents,
        remainingCents: input.amountCents,
        currency,
        ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
        ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
      },
      select: { id: true, amountCents: true, remainingCents: true },
    });
  }

  /**
   * Revoke a grant: stop it being spent (sets `revokedAt`; the debit + balance queries exclude it).
   * The unspent `remainingCents` is preserved for the record. Owner client; the caller authorizes.
   */
  async revokeGrant(grantId: string): Promise<{ id: string }> {
    try {
      return await this.db.admin.creditGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date() },
        select: { id: true },
      });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundError('Grant not found');
      throw err;
    }
  }

  /**
   * Redeem a promo code for a tenant. One owner-client transaction with the code row locked
   * (`FOR UPDATE`) so concurrent redemptions can't exceed the global `maxRedemptions`; the
   * `perTenantLimit` is enforced by counting the tenant's existing grants from this code. On success
   * bumps `redeemedCount` and creates a PROMO grant (inheriting the code's expiry).
   */
  async redeemPromoCode(
    tenantId: string,
    rawCode: string,
  ): Promise<{ grantId: string; amountCents: number }> {
    const code = normalizePromoCode(rawCode);
    return this.db.admin.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          id: string;
          kind: GrantKind;
          amountCents: number;
          currency: string;
          maxRedemptions: number | null;
          perTenantLimit: number;
          redeemedCount: number;
          expiresAt: Date | null;
          active: boolean;
        }[]
      >`
        SELECT id, kind, "amountCents", currency, "maxRedemptions", "perTenantLimit",
               "redeemedCount", "expiresAt", active
        FROM "PromoCode" WHERE code = ${code} FOR UPDATE`;
      const pc = rows[0];
      if (!pc || !pc.active) throw new ValidationError('Invalid promo code');
      if (pc.expiresAt && pc.expiresAt.getTime() <= Date.now()) {
        throw new ValidationError('This promo code has expired');
      }
      if (pc.maxRedemptions !== null && pc.redeemedCount >= pc.maxRedemptions) {
        throw new ValidationError('This promo code has been fully redeemed');
      }
      const used = await tx.creditGrant.count({ where: { tenantId, promoCodeId: pc.id } });
      if (used >= pc.perTenantLimit) {
        throw new ValidationError('You have already redeemed this promo code');
      }

      await tx.promoCode.update({
        where: { id: pc.id },
        data: { redeemedCount: { increment: 1 } },
      });
      const grant = await tx.creditGrant.create({
        data: {
          tenantId,
          kind: pc.kind,
          source: `promo:${code}`,
          amountCents: pc.amountCents,
          remainingCents: pc.amountCents,
          currency: pc.currency,
          promoCodeId: pc.id,
          ...(pc.expiresAt ? { expiresAt: pc.expiresAt } : {}),
        },
        select: { id: true, amountCents: true },
      });
      return { grantId: grant.id, amountCents: grant.amountCents };
    });
  }

  /** Create a redeemable promo code (super-admin). Owner client; the DB enforces code uniqueness. */
  async createPromoCode(
    input: CreatePromoCodeInput,
    opts: { createdBy?: string } = {},
  ): Promise<{ id: string; code: string }> {
    const code = normalizePromoCode(input.code);
    try {
      return await this.db.admin.promoCode.create({
        data: {
          code,
          kind: input.kind,
          amountCents: input.amountCents,
          perTenantLimit: input.perTenantLimit,
          ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
          ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
        },
        select: { id: true, code: true },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ValidationError('A promo code with that name already exists');
      }
      throw err;
    }
  }
}
