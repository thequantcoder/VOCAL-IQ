import {
  NotFoundError,
  type OutcomeType,
  ValidationError,
  canBillOutcome,
  outcomeCharge,
  outcomeDedupeKey,
  outcomePriceSchema,
  outcomeRefundKey,
  recordOutcomeSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { WalletService } from '../wallet/wallet.service';

/**
 * Outcome-based billing (Day 82). Charges per VERIFIED outcome (qualified lead / booking / payment)
 * instead of per minute. Two guarantees, both delegated to audited primitives: VERIFICATION — an
 * outcome is only billable when the referenced entity is genuinely achieved (`canBillOutcome`), and
 * it is billed AT MOST ONCE (the wallet idempotency key + a unique `(tenant,type,refId)` row —
 * self-audit C, no gaming); and MONEY — the charge (retail = price + reseller markup) flows through
 * the same idempotent, no-overdraw `WalletService` used for calls (self-audit D). Every read/write is
 * RLS-scoped (self-audit B).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTCOME_SELECT = {
  id: true,
  type: true,
  refId: true,
  status: true,
  priceCents: true,
  retailCents: true,
  resellerTenantId: true,
  resellerMarginCents: true,
  note: true,
  occurredAt: true,
} as const;

/** Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

export class OutcomeBillingService {
  constructor(
    private readonly db: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // ── pricing config ──────────────────────────────────────────────────────────

  /** Set (upsert) the tenant's price for an outcome type. */
  async setPrice(tenantId: string, input: unknown) {
    const parsed = outcomePriceSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid outcome price');
    const d = parsed.data;
    return this.db.withTenant(tenantId, (tx) =>
      tx.outcomePrice.upsert({
        where: { tenantId_type: { tenantId, type: d.type } },
        create: {
          tenantId,
          type: d.type,
          priceCents: d.priceCents,
          markupBps: d.markupBps,
          active: d.active,
        },
        update: { priceCents: d.priceCents, markupBps: d.markupBps, active: d.active },
        select: { type: true, priceCents: true, markupBps: true, active: true },
      }),
    );
  }

  async prices(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.outcomePrice.findMany({
        orderBy: { type: 'asc' },
        select: { type: true, priceCents: true, markupBps: true, active: true },
      }),
    );
  }

  // ── metering + billing ────────────────────────────────────────────────────────

  /** The referenced entity's current status (RLS-scoped) — or null if it doesn't exist / bad id. */
  private async entityStatus(
    tenantId: string,
    type: OutcomeType,
    refId: string,
  ): Promise<string | null> {
    if (!UUID_RE.test(refId)) return null; // internal outcomes reference uuid ids
    return this.db.withTenant(tenantId, async (tx) => {
      if (type === 'qualified_lead') {
        const l = await tx.lead.findFirst({ where: { id: refId }, select: { status: true } });
        return l?.status ?? null;
      }
      if (type === 'booking') {
        const a = await tx.appointment.findFirst({
          where: { id: refId },
          select: { status: true },
        });
        return a?.status ?? null;
      }
      const p = await tx.payment.findFirst({ where: { id: refId }, select: { status: true } });
      return p?.status ?? null;
    });
  }

  /**
   * Record + bill one achieved outcome. Verifies the outcome actually happened, charges the wallet
   * idempotently (retail = price + reseller markup), and writes the audit row. Replaying the same
   * outcome returns the existing record without charging again (self-audit C + D).
   */
  async recordOutcome(tenantId: string, input: unknown) {
    const parsed = recordOutcomeSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid outcome');
    const d = parsed.data;

    const [status, price] = await Promise.all([
      this.entityStatus(tenantId, d.type, d.refId),
      this.db.withTenant(tenantId, (tx) =>
        tx.outcomePrice.findFirst({
          where: { type: d.type },
          select: { priceCents: true, markupBps: true, active: true },
        }),
      ),
    ]);

    const gate = canBillOutcome({ type: d.type, price, entityStatus: status });
    if (!gate.ok) throw new ValidationError(gate.reason);
    const markupBps = price?.markupBps ?? 0;
    const charge = outcomeCharge(gate.priceCents, markupBps);

    // Charge the wallet idempotently by the outcome key (a replay never double-bills).
    await this.wallet.chargeOutcome(tenantId, {
      key: outcomeDedupeKey(d.type, d.refId),
      wholesaleCents: gate.priceCents,
      markupBps,
      ...(d.resellerTenantId ? { resellerTenantId: d.resellerTenantId } : {}),
      ...(d.period ? { period: d.period } : {}),
    });

    // Write the audit row (unique (tenant,type,refId) → a replayed/concurrent record returns the
    // existing one). The create + the fallback read run in SEPARATE transactions, so a unique
    // violation (which aborts its transaction) doesn't poison the follow-up read.
    try {
      return await this.db.withTenant(tenantId, (tx) =>
        tx.billableOutcome.create({
          data: {
            tenantId,
            type: d.type,
            refId: d.refId,
            status: 'billed',
            priceCents: charge.wholesaleCents,
            retailCents: charge.retailCents,
            resellerMarginCents: charge.resellerMarginCents,
            ...(d.resellerTenantId ? { resellerTenantId: d.resellerTenantId } : {}),
            ...(d.period ? { period: d.period } : {}),
          },
          select: OUTCOME_SELECT,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.db.withTenant(tenantId, (tx) =>
          tx.billableOutcome.findFirst({
            where: { type: d.type, refId: d.refId },
            select: OUTCOME_SELECT,
          }),
        );
        if (existing) return existing;
      }
      throw err;
    }
  }

  async list(tenantId: string, status?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.billableOutcome.findMany({
        where: status ? { status } : {},
        orderBy: { occurredAt: 'desc' },
        take: 500,
        select: OUTCOME_SELECT,
      }),
    );
  }

  /**
   * Dispute a billed outcome: credit the customer's wallet back (idempotently — a re-dispute never
   * double-refunds) and mark the row refunded. Only a `billed` outcome can be disputed.
   */
  async dispute(tenantId: string, id: string, note?: string) {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.billableOutcome.findFirst({
        where: { id },
        select: {
          id: true,
          type: true,
          refId: true,
          priceCents: true,
          retailCents: true,
          resellerTenantId: true,
          period: true,
          status: true,
        },
      }),
    );
    if (!row) throw new NotFoundError('Outcome not found');
    if (row.status !== 'billed')
      throw new ValidationError(`Cannot dispute an outcome that is ${row.status}.`);

    // Idempotent credit back to the customer's wallet (a re-dispute is blocked by the status guard).
    await this.wallet.topUp(tenantId, {
      amountCents: row.retailCents,
      key: outcomeRefundKey(row.type as OutcomeType, row.refId),
      reason: 'outcome_dispute_refund',
    });

    // Reverse the reseller margin this outcome accrued, so a dispute is the exact inverse of the
    // charge (customer refunded retail ⇒ reseller loses its margin). Only when it accrued one.
    if (row.resellerTenantId && row.period) {
      await this.wallet.accrueMargin(
        row.resellerTenantId,
        tenantId,
        row.period,
        -row.retailCents,
        -row.priceCents,
      );
    }

    return this.db.withTenant(tenantId, (tx) =>
      tx.billableOutcome.update({
        where: { id },
        data: { status: 'refunded', ...(note ? { note } : {}) },
        select: OUTCOME_SELECT,
      }),
    );
  }
}
