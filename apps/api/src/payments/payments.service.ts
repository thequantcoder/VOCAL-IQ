import {
  NotFoundError,
  type PaymentStatus,
  ValidationError,
  applyRefund,
  assertPciSafe,
  buildReceipt,
  paymentRequestSchema,
  refundInputSchema,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Pay-by-voice payments (Day 78). A customer of the tenant pays the tenant over a call. VocalIQ runs
 * the PCI **out-of-scope** model: the card is captured by a gated PCI provider (DTMF/tokenised at the
 * media layer), so this service NEVER receives or stores a PAN/CVV — only an opaque provider ref +
 * `token` + `last4` (self-audit C). Every row is RLS tenant-scoped (self-audit B), charges are
 * idempotent (no double-charge — self-audit D), and receipts are best-effort so a receipt failure can
 * never undo a completed charge.
 */

/** What the PCI provider returns — never a card number. */
export interface CaptureOutcome {
  chargeId: string;
  token: string;
  last4: string;
  status: PaymentStatus;
}

/** Gated PCI capture provider seam (mirrors the Day-26 VoiceCloner / Day-76 FineTuneProvider). */
export interface PciCaptureProvider {
  readonly enabled: boolean;
  captureAndCharge(input: {
    tenantId: string;
    amountCents: number;
    currency: string;
    description?: string;
  }): Promise<CaptureOutcome>;
  refund(input: { tenantId: string; chargeId: string; amountCents: number }): Promise<void>;
}

/** Disabled fallback — refuses clearly rather than ever handle card data without a real provider. */
export class DisabledPciCaptureProvider implements PciCaptureProvider {
  readonly enabled = false;
  private fail(): never {
    throw new ValidationError(
      'PCI capture is not configured. Set a PCI-compliant capture provider (PCI_CAPTURE_*) to take payments on a call.',
    );
  }
  async captureAndCharge(): Promise<CaptureOutcome> {
    return this.fail();
  }
  async refund(): Promise<void> {
    return this.fail();
  }
}

/** Build the PCI provider from env (gated). A real PCI-DSS adapter swaps in when a key is present. */
export function buildPciCaptureProvider(_env: NodeJS.ProcessEnv): PciCaptureProvider {
  return new DisabledPciCaptureProvider();
}

/** Gated receipt sender (email/SMS). Best-effort — a missing sender skips the receipt, never errors. */
export interface ReceiptSender {
  readonly enabled: boolean;
  send(input: { channel: 'email' | 'sms'; to: string; body: string }): Promise<void>;
}

export class DisabledReceiptSender implements ReceiptSender {
  readonly enabled = false;
  async send(): Promise<void> {
    /* no channel configured — the receipt is simply not sent */
  }
}

export function buildReceiptSender(_env: NodeJS.ProcessEnv): ReceiptSender {
  return new DisabledReceiptSender();
}

/** Prisma unique-constraint violation (P2002) — how a raced idempotent charge is detected. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

const PAYMENT_SELECT = {
  id: true,
  callId: true,
  agentId: true,
  amountCents: true,
  currency: true,
  refundedCents: true,
  status: true,
  provider: true,
  providerRef: true,
  last4: true,
  description: true,
  receiptChannel: true,
  receiptTo: true,
  receiptSentAt: true,
  createdAt: true,
} as const; // NB: `token` is intentionally never selected into API responses.

export class PaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly pci: PciCaptureProvider,
    private readonly receipts: ReceiptSender,
  ) {}

  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: PAYMENT_SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.payment.findFirst({ where: { id }, select: PAYMENT_SELECT }),
    );
    if (!row) throw new NotFoundError('Payment not found');
    return row;
  }

  /**
   * Take a payment. Validates + PCI-scans the input (no card data may enter our stores), charges via
   * the gated PCI provider, records the result (only ref/last4 — never a PAN), and sends a receipt
   * best-effort. Idempotent: replaying the same `idempotencyKey` returns the existing payment instead
   * of charging twice.
   */
  async charge(tenantId: string, input: unknown) {
    const parsed = paymentRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid payment');
    const d = parsed.data;
    // Last line of defence: reject if a card number hides anywhere in the request (self-audit C).
    assertPciSafe({ description: d.description, receiptTo: d.receiptTo }, 'payment');

    // RESERVE the idempotency key by creating the pending row BEFORE charging. The unique
    // (tenantId, idempotencyKey) constraint makes a concurrent duplicate fail HERE — before any
    // money moves — so the same key can never charge twice (self-audit D; mirrors the wallet ledger).
    let paymentId: string;
    try {
      const created = await this.db.withTenant(tenantId, (tx) =>
        tx.payment.create({
          data: {
            tenantId,
            amountCents: d.amountCents,
            currency: d.currency,
            status: 'pending',
            provider: 'PCI',
            description: d.description || null,
            receiptChannel: d.receiptChannel,
            receiptTo: d.receiptTo || null,
            ...(d.callId ? { callId: d.callId } : {}),
            ...(d.agentId ? { agentId: d.agentId } : {}),
            ...(d.idempotencyKey ? { idempotencyKey: d.idempotencyKey } : {}),
          },
          select: { id: true },
        }),
      );
      paymentId = created.id;
    } catch (err) {
      // Duplicate idempotency key → a charge for this key already exists; return it, don't re-charge.
      if (d.idempotencyKey && isUniqueViolation(err)) {
        const key = d.idempotencyKey;
        const existing = await this.db.withTenant(tenantId, (tx) =>
          tx.payment.findFirst({ where: { idempotencyKey: key }, select: PAYMENT_SELECT }),
        );
        if (existing) return existing;
      }
      throw err;
    }

    // Charge via the PCI provider (throws a clear "not configured" error when gated). On failure the
    // reserved row is marked failed (audit trail) and the error surfaces.
    let outcome: CaptureOutcome;
    try {
      outcome = await this.pci.captureAndCharge({
        tenantId,
        amountCents: d.amountCents,
        currency: d.currency,
        description: d.description,
      });
    } catch (err) {
      await this.db.withTenant(tenantId, (tx) =>
        tx.payment.update({ where: { id: paymentId }, data: { status: 'failed' } }),
      );
      throw err;
    }

    const receiptSentAt = await this.maybeSendReceipt(d, outcome);

    return this.db.withTenant(tenantId, (tx) =>
      tx.payment.update({
        where: { id: paymentId },
        data: {
          status: outcome.status,
          providerRef: outcome.chargeId,
          token: outcome.token, // safe token (never a card); excluded from API responses
          last4: outcome.last4,
          receiptSentAt,
        },
        select: PAYMENT_SELECT,
      }),
    );
  }

  /** Refund a payment (full or partial). Pure `applyRefund` decides legality; the provider then acts. */
  async refund(tenantId: string, id: string, input: unknown) {
    const parsed = refundInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid refund');

    return this.db.withTenant(tenantId, async (tx) => {
      // Lock the row for the transaction so concurrent refunds serialize: the loser blocks, then
      // re-reads the updated refundedCents and applyRefund rejects any over-refund (self-audit D).
      await tx.$executeRaw`SELECT 1 FROM "Payment" WHERE id = ${id}::uuid FOR UPDATE`;
      const payment = await tx.payment.findFirst({
        where: { id },
        select: {
          amountCents: true,
          refundedCents: true,
          status: true,
          providerRef: true,
          lastRefundKey: true,
        },
      });
      if (!payment) throw new NotFoundError('Payment not found');

      // Idempotent refund retry: replaying the same key returns the current payment (the FOR UPDATE
      // lock makes this race-safe) instead of refunding again (self-audit D).
      const key = parsed.data.idempotencyKey;
      if (key && payment.lastRefundKey === key) {
        const current = await tx.payment.findFirst({ where: { id }, select: PAYMENT_SELECT });
        if (!current) throw new NotFoundError('Payment not found');
        return current;
      }

      const outcome = applyRefund(
        {
          amountCents: payment.amountCents,
          refundedCents: payment.refundedCents,
          status: payment.status as PaymentStatus,
        },
        parsed.data.amountCents,
      );
      if (!outcome.ok) throw new ValidationError(outcome.reason);

      const refundAmount = outcome.refundedCents - payment.refundedCents;
      await this.pci.refund({
        tenantId,
        chargeId: payment.providerRef ?? '',
        amountCents: refundAmount,
      });

      return tx.payment.update({
        where: { id },
        data: {
          refundedCents: outcome.refundedCents,
          status: outcome.status,
          ...(key ? { lastRefundKey: key } : {}),
        },
        select: PAYMENT_SELECT,
      });
    });
  }

  /** Send a receipt if a channel + destination are set and a sender is configured. Never throws. */
  private async maybeSendReceipt(
    d: {
      receiptChannel: string;
      receiptTo: string;
      amountCents: number;
      currency: string;
      description: string;
    },
    outcome: CaptureOutcome,
  ): Promise<Date | null> {
    if (
      outcome.status !== 'succeeded' ||
      d.receiptChannel === 'none' ||
      !d.receiptTo ||
      !this.receipts.enabled
    )
      return null;
    try {
      await this.receipts.send({
        channel: d.receiptChannel as 'email' | 'sms',
        to: d.receiptTo,
        body: buildReceipt({
          amountCents: d.amountCents,
          currency: d.currency,
          description: d.description,
          last4: outcome.last4,
          chargeId: outcome.chargeId,
        }),
      });
      return new Date();
    } catch {
      return null; // best-effort: a receipt failure never undoes a completed charge
    }
  }
}
