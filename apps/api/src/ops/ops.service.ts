import {
  ForbiddenError,
  NotFoundError,
  type TicketPriority,
  type TicketStatus,
  type TrialLimits,
  ValidationError,
  canAssignNumber,
  canTransitionTicket,
  checkTrialLimit,
  drainCredits,
  isLowBalance,
  trialLimitsSchema,
} from '@vocaliq/shared';
import type { EntitlementsService } from '../billing/entitlements.service';
import type { PrismaService } from '../db/prisma.service';

/**
 * SaaS ops toolkit (Day 49): support tickets, prepaid + bonus credits, the phone-number pool
 * with KYC + per-plan limits, notifications (incl. super-admin broadcast), and configurable
 * trial limits. All tenant reads/writes are RLS-scoped (self-audit B); the credit maths reuse
 * the pure `@vocaliq/shared` helpers (bonus drained first — self-audit D). Number KYC + broadcast
 * are platform-operator (SUPER_ADMIN) actions gated at the route layer.
 */

const LOW_BALANCE_THRESHOLD_CENTS = 500;

/** Explicit DTO so the return type never leaks Prisma's runtime types (TS2742). */
export interface NotificationRow {
  id: string;
  channel: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export class OpsService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ── Support tickets ──────────────────────────────────────────────────────────

  async createTicket(
    tenantId: string,
    input: { subject: string; body: string; priority?: TicketPriority },
  ) {
    if (!input.subject?.trim()) throw new ValidationError('A subject is required');
    return this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.create({
        data: {
          tenantId,
          subject: input.subject.trim(),
          body: input.body ?? '',
          priority: input.priority ?? 'NORMAL',
        },
        select: TICKET_SELECT,
      }),
    );
  }

  async listTickets(tenantId: string, status?: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        select: TICKET_SELECT,
      }),
    );
  }

  async assignTicket(tenantId: string, id: string, assignee: string | null) {
    await this.ticketOr404(tenantId, id);
    return this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.update({ where: { id }, data: { assignee }, select: TICKET_SELECT }),
    );
  }

  async setTicketStatus(tenantId: string, id: string, to: TicketStatus) {
    const current = await this.ticketOr404(tenantId, id);
    if (!canTransitionTicket(current.status as TicketStatus, to)) {
      throw new ValidationError(`Cannot move a ticket from ${current.status} to ${to}`);
    }
    return this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.update({ where: { id }, data: { status: to }, select: TICKET_SELECT }),
    );
  }

  private async ticketOr404(tenantId: string, id: string) {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.supportTicket.findFirst({ where: { id }, select: { id: true, status: true } }),
    );
    if (!t) throw new NotFoundError('Ticket not found');
    return t;
  }

  // ── Credits ────────────────────────────────────────────────────────────────

  async getWallet(tenantId: string) {
    const w = await this.db.withTenant(tenantId, (tx) =>
      tx.wallet.upsert({
        where: { tenantId },
        create: { tenantId },
        update: {},
        select: { balanceCents: true, bonusCents: true },
      }),
    );
    return {
      prepaidCents: w.balanceCents,
      bonusCents: w.bonusCents,
      totalCents: w.balanceCents + w.bonusCents,
    };
  }

  /** Add prepaid or bonus (perk) credits. Positive cents only. */
  async addCredits(tenantId: string, cents: number, kind: 'prepaid' | 'bonus') {
    if (cents <= 0) throw new ValidationError('Credit amount must be positive');
    const data =
      kind === 'bonus'
        ? { bonusCents: { increment: cents } }
        : { balanceCents: { increment: cents } };
    await this.db.withTenant(tenantId, (tx) =>
      tx.wallet.upsert({
        where: { tenantId },
        create: {
          tenantId,
          ...(kind === 'bonus' ? { bonusCents: cents } : { balanceCents: cents }),
        },
        update: data,
      }),
    );
    return this.getWallet(tenantId);
  }

  /**
   * Drain `cents` on usage: bonus credits first, then prepaid (pure `drainCredits`). Persists
   * the new balances and raises a low-balance notification when the total dips below threshold.
   * Returns the balances + any uncovered shortfall (caller can block / auto-recharge).
   */
  async drain(tenantId: string, cents: number) {
    return this.db.withTenant(tenantId, async (tx) => {
      const w = await tx.wallet.upsert({
        where: { tenantId },
        create: { tenantId },
        update: {},
        select: { balanceCents: true, bonusCents: true },
      });
      const res = drainCredits({ prepaidCents: w.balanceCents, bonusCents: w.bonusCents }, cents);
      await tx.wallet.update({
        where: { tenantId },
        data: { balanceCents: res.prepaidCents, bonusCents: res.bonusCents },
      });
      if (
        isLowBalance(
          { prepaidCents: res.prepaidCents, bonusCents: res.bonusCents },
          LOW_BALANCE_THRESHOLD_CENTS,
        )
      ) {
        await tx.notification.create({
          data: {
            tenantId,
            channel: 'inapp',
            payload: {
              type: 'low_balance',
              totalCents: res.prepaidCents + res.bonusCents,
            } as object,
          },
        });
      }
      return {
        prepaidCents: res.prepaidCents,
        bonusCents: res.bonusCents,
        drainedCents: res.drainedCents,
        shortfallCents: res.shortfallCents,
      };
    });
  }

  // ── Phone-number pool + KYC + limits ─────────────────────────────────────────

  /** The pool the tenant can see: its own numbers + unassigned platform-pool numbers. */
  async listNumbers(tenantId: string) {
    const [owned, pool] = await Promise.all([
      // Explicit tenant filter: the global (tenantId=null) pool is RLS-visible to everyone,
      // so "owned" must exclude it (that's the `available` list below).
      this.db.withTenant(tenantId, (tx) =>
        tx.phoneNumber.findMany({ where: { tenantId }, select: NUMBER_SELECT }),
      ),
      this.db.admin.phoneNumber.findMany({ where: { tenantId: null }, select: NUMBER_SELECT }),
    ]);
    return { owned, available: pool };
  }

  /** Claim a pool number for an agent — enforces KYC + the plan's number limit. */
  async assignNumber(tenantId: string, numberId: string, agentId: string) {
    const number = await this.db.admin.phoneNumber.findUnique({
      where: { id: numberId },
      select: { id: true, tenantId: true, kycVerified: true },
    });
    if (!number || (number.tenantId && number.tenantId !== tenantId)) {
      throw new NotFoundError('Number not available');
    }
    if (!number.kycVerified)
      throw new ForbiddenError('Number requires KYC verification before assignment');

    const ent = await this.entitlements.entitlements(tenantId);
    const currentAssigned = await this.db.withTenant(tenantId, (tx) => tx.phoneNumber.count());
    if (!canAssignNumber(currentAssigned, ent.numberLimit)) {
      throw new ForbiddenError(`Your plan allows ${ent.numberLimit} number(s)`);
    }
    // Verify the agent belongs to the tenant (RLS).
    const agent = await this.db.withTenant(tenantId, (tx) =>
      tx.agent.findFirst({ where: { id: agentId }, select: { id: true } }),
    );
    if (!agent) throw new NotFoundError('Agent not found');

    await this.db.admin.phoneNumber.update({
      where: { id: numberId },
      data: { tenantId, assignedAgentId: agentId, source: 'PURCHASED' },
    });
    return { assigned: true };
  }

  async releaseNumber(tenantId: string, numberId: string) {
    const owned = await this.db.withTenant(tenantId, (tx) =>
      tx.phoneNumber.findFirst({ where: { id: numberId }, select: { id: true } }),
    );
    if (!owned) throw new NotFoundError('Number not found');
    await this.db.admin.phoneNumber.update({
      where: { id: numberId },
      data: { tenantId: null, assignedAgentId: null, source: 'POOL' },
    });
    return { released: true };
  }

  /** Set a number's KYC badge — platform operator only (gated at the route). */
  async setKyc(numberId: string, verified: boolean) {
    const n = await this.db.admin.phoneNumber.findUnique({
      where: { id: numberId },
      select: { id: true },
    });
    if (!n) throw new NotFoundError('Number not found');
    await this.db.admin.phoneNumber.update({
      where: { id: numberId },
      data: { kycVerified: verified },
    });
    return { kycVerified: verified };
  }

  // ── Notifications ─────────────────────────────────────────────────────────────

  async listNotifications(tenantId: string): Promise<NotificationRow[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: NOTIF_SELECT }),
    );
  }

  async markRead(tenantId: string, id: string): Promise<NotificationRow> {
    const n = await this.db.withTenant(tenantId, (tx) =>
      tx.notification.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!n) throw new NotFoundError('Notification not found');
    return this.db.withTenant(tenantId, (tx) =>
      tx.notification.update({ where: { id }, data: { readAt: new Date() }, select: NOTIF_SELECT }),
    );
  }

  /** Super-admin broadcast: one notification per target tenant (owner client, platform action). */
  async broadcast(tenantIds: string[], message: string): Promise<{ sent: number }> {
    if (!message.trim()) throw new ValidationError('A message is required');
    await this.db.admin.notification.createMany({
      data: tenantIds.map((tenantId) => ({
        tenantId,
        channel: 'broadcast',
        payload: { type: 'broadcast', message } as object,
      })),
    });
    return { sent: tenantIds.length };
  }

  // ── Trial limits ──────────────────────────────────────────────────────────────

  async getTrialLimits(tenantId: string): Promise<TrialLimits> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = (t?.settings ?? {}) as { trialLimits?: unknown };
    const parsed = trialLimitsSchema.safeParse(settings.trialLimits ?? {});
    return parsed.success ? parsed.data : trialLimitsSchema.parse({});
  }

  async setTrialLimits(tenantId: string, input: unknown): Promise<TrialLimits> {
    const limits = trialLimitsSchema.parse(input);
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), trialLimits: limits };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return limits;
  }

  /** Enforce the trial for a create op. No-op unless the tenant is on a TRIAL status. */
  async assertTrialAllows(tenantId: string, kind: 'agent' | 'call'): Promise<void> {
    const tenant = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { status: true, createdAt: true } }),
    );
    if (!tenant || tenant.status !== 'TRIAL') return;

    const limits = await this.getTrialLimits(tenantId);
    const [agents, calls] = await this.db.withTenant(tenantId, async (tx) => [
      await tx.agent.count(),
      await tx.call.count(),
    ]);
    const ageDays = Math.floor((Date.now() - tenant.createdAt.getTime()) / 86_400_000);
    const check = checkTrialLimit(limits, { agents, calls, ageDays }, kind);
    if (!check.allowed) throw new ForbiddenError(check.reason);
  }
}

const TICKET_SELECT = {
  id: true,
  subject: true,
  body: true,
  status: true,
  priority: true,
  assignee: true,
  createdAt: true,
} as const;

const NUMBER_SELECT = {
  id: true,
  e164: true,
  capabilities: true,
  kycVerified: true,
  source: true,
  assignedAgentId: true,
} as const;

const NOTIF_SELECT = {
  id: true,
  channel: true,
  payload: true,
  readAt: true,
  createdAt: true,
} as const;
