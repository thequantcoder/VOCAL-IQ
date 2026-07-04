import {
  ForbiddenError,
  NotFoundError,
  type PlanInput,
  type PricingSnapshot,
  Role,
  ValidationError,
  planUpdateStrategy,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { BillingProcessor } from './processor';

/**
 * No-code plan & pricing builder (Day 56). Admins compose subscription tiers — price, included
 * minutes, agent/number/SIP limits, overage rates, feature toggles — with no code, and mirror
 * them to the payment processor (gated until Stripe keys). Scope is the critical property
 * (self-audit B + C): a SUPER_ADMIN manages GLOBAL plans (tenantId null) + any tenant's; a
 * RESELLER_ADMIN manages ONLY its own reseller-scoped plans — enforced by `assertCanManage`
 * before every write. Editing a plan that already has active subscribers forks a new VERSION so
 * existing subscribers are grandfathered onto their original terms (self-audit D). Money is
 * integer minor units throughout.
 */

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface PlanDto {
  id: string;
  tenantId: string | null;
  name: string;
  priceMonthly: number;
  currency: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
  features: Record<string, unknown>;
  isResellerPlan: boolean;
  version: number;
  active: boolean;
  supersededById: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

export class PlanBuilderService {
  constructor(
    private readonly db: PrismaService,
    private readonly processor: BillingProcessor,
  ) {}

  /** Plans the actor may see: SUPER_ADMIN → all; RESELLER_ADMIN → global + its own. */
  async list(actor: Actor): Promise<PlanDto[]> {
    const where =
      actor.role === Role.SUPER_ADMIN
        ? {}
        : { OR: [{ tenantId: null }, { tenantId: actor.tenantId }] };
    const plans = await this.db.admin.plan.findMany({
      where,
      orderBy: [{ tenantId: 'asc' }, { priceMonthly: 'asc' }, { version: 'asc' }],
      select: SELECT,
    });
    return plans.map(toDto);
  }

  /**
   * Create a plan. `scope: 'global'` (tenantId null) is SUPER_ADMIN-only; otherwise the plan is
   * hard-scoped to the actor's own reseller tenant (a reseller can never create a plan for anyone
   * else). Returns the new plan; sync to the processor is a separate, explicit step.
   */
  async create(actor: Actor, input: PlanInput, scope: 'global' | 'own'): Promise<PlanDto> {
    let tenantId: string | null;
    if (scope === 'global') {
      if (actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super-admin can create a global plan');
      }
      tenantId = null;
    } else {
      if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.RESELLER_ADMIN) {
        throw new ForbiddenError('Only an admin can create plans');
      }
      tenantId = actor.tenantId; // isolation: a reseller's plan is always its own
    }
    const created = await this.db.admin.plan.create({
      data: { ...planData(input), tenantId },
      select: SELECT,
    });
    return toDto(created);
  }

  /**
   * Edit a plan. If it has ACTIVE subscribers and any pricing field changed, we fork a new
   * version (old → inactive + `supersededById`, subscribers stay on it = grandfathered) rather
   * than mutate their terms; otherwise we update in place. Cosmetic edits (name/features) are
   * always in place.
   */
  async update(actor: Actor, id: string, input: PlanInput): Promise<PlanDto> {
    const plan = await this.load(id);
    this.assertCanManage(actor, plan.tenantId);
    if (!plan.active)
      throw new ValidationError('This plan version is archived and cannot be edited');

    const current: PricingSnapshot = pricingOf(plan);
    const next: PricingSnapshot = pricingOf(planData(input));
    const activeSubscribers = await this.db.admin.subscription.count({
      where: { planId: id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });
    const { action } = planUpdateStrategy(current, next, activeSubscribers > 0);

    if (action === 'update') {
      const updated = await this.db.admin.plan.update({
        where: { id },
        // Pricing may change here only when there are no active subscribers.
        data: planData(input),
        select: SELECT,
      });
      return toDto(updated);
    }

    // Version: fork a fresh active plan; retire the old one, grandfathering its subscribers.
    return this.db.admin.$transaction(async (tx) => {
      const fresh = await tx.plan.create({
        data: { ...planData(input), tenantId: plan.tenantId, version: plan.version + 1 },
        select: SELECT,
      });
      await tx.plan.update({
        where: { id },
        data: { active: false, supersededById: fresh.id },
      });
      return toDto(fresh);
    });
  }

  /** Archive a plan (stop offering it). Existing subscribers keep it until they change. */
  async archive(actor: Actor, id: string): Promise<PlanDto> {
    const plan = await this.load(id);
    this.assertCanManage(actor, plan.tenantId);
    const updated = await this.db.admin.plan.update({
      where: { id },
      data: { active: false },
      select: SELECT,
    });
    return toDto(updated);
  }

  /**
   * Mirror a plan to the payment processor (Stripe) and persist the returned ids. Gated: the
   * PendingBillingProcessor returns `{ synced: false }` and this is a safe no-op (the plan stays
   * fully usable locally) until STRIPE_* keys are set.
   */
  async sync(actor: Actor, id: string): Promise<{ plan: PlanDto; synced: boolean }> {
    const plan = await this.load(id);
    this.assertCanManage(actor, plan.tenantId);
    const result = await this.processor.syncPlan({
      planId: plan.id,
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      currency: plan.currency,
      stripeProductId: plan.stripeProductId,
    });
    if (!result.synced) return { plan: toDto(plan), synced: false };
    const updated = await this.db.admin.plan.update({
      where: { id },
      data: { stripeProductId: result.stripeProductId, stripePriceId: result.stripePriceId },
      select: SELECT,
    });
    return { plan: toDto(updated), synced: true };
  }

  private async load(id: string) {
    const plan = await this.db.admin.plan.findUnique({ where: { id }, select: SELECT });
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  }

  /** The authoritative scope guard — a reseller may only manage its OWN plans. */
  private assertCanManage(actor: Actor, planTenantId: string | null): void {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.RESELLER_ADMIN && planTenantId === actor.tenantId) return;
    throw new ForbiddenError('You cannot manage this plan');
  }
}

type PlanRow = {
  priceMonthly: number;
  currency: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
};

function pricingOf(p: PlanRow): PricingSnapshot {
  return {
    priceMonthly: p.priceMonthly,
    currency: p.currency,
    includedMinutes: p.includedMinutes,
    agentLimit: p.agentLimit,
    numberLimit: p.numberLimit,
    sipLimit: p.sipLimit,
    overageRatePerMin: p.overageRatePerMin,
  };
}

/** Map validated input → the plan columns (excluding scope/version, set by the caller). */
function planData(input: PlanInput) {
  return {
    name: input.name,
    priceMonthly: input.priceMonthly,
    currency: input.currency,
    includedMinutes: input.includedMinutes,
    agentLimit: input.agentLimit,
    numberLimit: input.numberLimit,
    sipLimit: input.sipLimit,
    overageRatePerMin: input.overageRatePerMin,
    features: input.features as object,
    isResellerPlan: input.isResellerPlan,
  };
}

function toDto(p: {
  id: string;
  tenantId: string | null;
  name: string;
  priceMonthly: number;
  currency: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
  features: unknown;
  isResellerPlan: boolean;
  version: number;
  active: boolean;
  supersededById: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
}): PlanDto {
  return {
    ...p,
    features: (p.features as Record<string, unknown>) ?? {},
  };
}

const SELECT = {
  id: true,
  tenantId: true,
  name: true,
  priceMonthly: true,
  currency: true,
  includedMinutes: true,
  agentLimit: true,
  numberLimit: true,
  sipLimit: true,
  overageRatePerMin: true,
  features: true,
  isResellerPlan: true,
  version: true,
  active: true,
  supersededById: true,
  stripeProductId: true,
  stripePriceId: true,
} as const;
