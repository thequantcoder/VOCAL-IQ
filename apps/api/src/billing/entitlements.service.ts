import {
  BillingError,
  PHASE6_FEATURES,
  type Phase6FeatureKey,
  planIncludesFeature,
  resolveAdvancedFeatures,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/**
 * Plan resolution + entitlement gating (Day 15, ties to Day 58). Resolves a tenant's
 * active plan (via its subscription, else the global Free plan) and enforces its limits.
 * Subscription + resource counts read under RLS (`withTenant`); the plan catalog is
 * global reference data read via the admin client.
 */

export interface Entitlements {
  planId: string;
  planName: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
  features: Record<string, unknown>;
  /** Resolved advanced-tier (Phase 6) feature entitlements for this plan — Day 94. */
  advancedFeatures: Record<Phase6FeatureKey, boolean>;
  usage: { agents: number };
}

export class EntitlementsService {
  constructor(private readonly db: PrismaService) {}

  /** The plan a tenant is currently entitled to (active subscription → plan, else Free). */
  private async resolvePlan(tenantId: string) {
    const sub = await this.db.withTenant(tenantId, (tx) =>
      tx.subscription.findFirst({
        where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' },
        select: { planId: true },
      }),
    );
    if (sub) {
      const plan = await this.db.admin.plan.findUnique({ where: { id: sub.planId } });
      if (plan) return plan;
    }
    // Fallback: the seeded global Free plan (lowest price, no tenant).
    const free = await this.db.admin.plan.findFirst({
      where: { tenantId: null },
      orderBy: { priceMonthly: 'asc' },
    });
    if (!free) throw new BillingError('No plan available for this account.');
    return free;
  }

  async entitlements(tenantId: string): Promise<Entitlements> {
    const plan = await this.resolvePlan(tenantId);
    const agents = await this.db.withTenant(tenantId, (tx) => tx.agent.count());
    return {
      planId: plan.id,
      planName: plan.name,
      includedMinutes: plan.includedMinutes,
      agentLimit: plan.agentLimit,
      numberLimit: plan.numberLimit,
      sipLimit: plan.sipLimit,
      overageRatePerMin: plan.overageRatePerMin,
      features: (plan.features as Record<string, unknown>) ?? {},
      advancedFeatures: resolveAdvancedFeatures(
        plan.name,
        plan.features as Record<string, unknown> | null,
      ),
      usage: { agents },
    };
  }

  /**
   * Does the tenant's plan include a Phase-6 advanced feature (Day 94)? Resolves explicit plan
   * overrides on top of the tier default. The heavy/sensitive features (video avatars, biometrics)
   * are Scale-only by default so margins hold (self-audit D) — the gate services call before spend.
   */
  async hasFeature(tenantId: string, key: Phase6FeatureKey): Promise<boolean> {
    const plan = await this.resolvePlan(tenantId);
    return planIncludesFeature(plan.name, plan.features as Record<string, unknown> | null, key);
  }

  /** Throw a clear upgrade error when a tenant's plan does not include an advanced feature. */
  async assertFeature(tenantId: string, key: Phase6FeatureKey): Promise<void> {
    if (await this.hasFeature(tenantId, key)) return;
    const plan = await this.resolvePlan(tenantId);
    const label = PHASE6_FEATURES.find((f) => f.key === key)?.label ?? key;
    throw new BillingError(
      `Your ${plan.name} plan does not include ${label}. Upgrade to enable it.`,
    );
  }

  /** Guard agent creation against the plan's agent limit (called before a create). */
  async assertCanCreateAgent(tenantId: string): Promise<void> {
    const plan = await this.resolvePlan(tenantId);
    const agents = await this.db.withTenant(tenantId, (tx) => tx.agent.count());
    if (agents >= plan.agentLimit) {
      throw new BillingError(
        `Your ${plan.name} plan allows ${plan.agentLimit} agent${plan.agentLimit === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
  }

  /** Guard SIP-trunk creation against the plan's sipLimit (Day 35). */
  async assertCanCreateSipTrunk(tenantId: string): Promise<void> {
    const plan = await this.resolvePlan(tenantId);
    const trunks = await this.db.withTenant(tenantId, (tx) => tx.sipTrunk.count());
    if (trunks >= plan.sipLimit) {
      throw new BillingError(
        plan.sipLimit === 0
          ? `Your ${plan.name} plan does not include SIP trunks. Upgrade to connect your own.`
          : `Your ${plan.name} plan allows ${plan.sipLimit} SIP trunk${plan.sipLimit === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
  }
}
