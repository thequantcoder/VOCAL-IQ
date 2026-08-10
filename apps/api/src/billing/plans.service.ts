import { PrismaService } from '../db/prisma.service';

/** Plan catalog + current-subscription reads for the billing screens (Day 15). */

export interface PlanDto {
  id: string;
  name: string;
  priceMonthly: number;
  currency: string;
  includedMinutes: number;
  agentLimit: number;
  numberLimit: number;
  sipLimit: number;
  overageRatePerMin: number;
  isResellerPlan: boolean;
}

export interface SubscriptionDto {
  id: string;
  status: string;
  currentPeriodEnd: Date | null;
  plan: { id: string; name: string; priceMonthly: number; currency: string };
}

export class PlansService {
  constructor(private readonly db: PrismaService) {}

  /** Global plans + this tenant's custom plans (catalog reference data → admin read). */
  async listPlans(tenantId: string): Promise<PlanDto[]> {
    return this.db.admin.plan.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }], isResellerPlan: false },
      orderBy: { priceMonthly: 'asc' },
      select: {
        id: true,
        name: true,
        priceMonthly: true,
        currency: true,
        includedMinutes: true,
        agentLimit: true,
        numberLimit: true,
        sipLimit: true,
        overageRatePerMin: true,
        isResellerPlan: true,
      },
    });
  }

  async currentSubscription(tenantId: string): Promise<SubscriptionDto | null> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.subscription.findFirst({
        where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          currentPeriodEnd: true,
          plan: { select: { id: true, name: true, priceMonthly: true, currency: true } },
        },
      }),
    );
  }
}
