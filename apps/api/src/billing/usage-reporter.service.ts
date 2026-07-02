import { Capability } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { overageCents } from './proration';

/**
 * Metered usage → billable minutes (self-audit focus D). Sums billable telephony seconds
 * from UsageRecords (Day 13) over a period, converts to minutes, and computes overage
 * beyond the plan's included minutes. The actual Stripe usage-record push is behind the
 * BillingProcessor seam (deferred until Stripe keys are set — memory: stripe-live-test-pending).
 */

export interface UsageReport {
  from: Date;
  to: Date;
  usedMinutes: number;
  includedMinutes: number;
  overageMinutes: number;
  overageCents: number;
}

export class UsageReporterService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async report(tenantId: string, from: Date, to: Date): Promise<UsageReport> {
    // Billable (non-BYOK) telephony seconds in the period.
    const agg = await this.db.withTenant(tenantId, (tx) =>
      tx.usageRecord.aggregate({
        _sum: { units: true },
        where: {
          capability: Capability.TELEPHONY,
          byok: false,
          ts: { gte: from, lt: to },
        },
      }),
    );
    const seconds = agg._sum.units ?? 0;
    const usedMinutes = Math.ceil(seconds / 60);

    const ent = await this.entitlements.entitlements(tenantId);
    const overageMinutes = Math.max(0, usedMinutes - ent.includedMinutes);
    return {
      from,
      to,
      usedMinutes,
      includedMinutes: ent.includedMinutes,
      overageMinutes,
      overageCents: overageCents({
        usedMinutes,
        includedMinutes: ent.includedMinutes,
        overageRatePerMinCents: ent.overageRatePerMin,
      }),
    };
  }
}
