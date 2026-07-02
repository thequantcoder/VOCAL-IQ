import { BillingError } from '@vocaliq/shared';
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
      usage: { agents },
    };
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
}
