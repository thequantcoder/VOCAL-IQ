import {
  type QuotaConfig,
  type QuotaResult,
  evaluateQuota,
  quotaPolicySchema,
} from '@vocaliq/shared';
import type { EntitlementsService } from '../billing/entitlements.service';
import type { PrismaService } from '../db/prisma.service';

/**
 * Quota enforcement (Day 58). Compares a tenant's usage against its plan entitlement under a
 * policy (hard blocks/auto-suspends at the cap; soft allows overage with a warning). The pure
 * decision is in @vocaliq/shared; here we gather usage + limit, apply the returned action
 * (suspend the tenant on a hard overage when configured), and notify once on a threshold crossing.
 * Every enforced suspension is audited (self-audit C). Usage is integer.
 */

export type QuotaResource = 'minutes' | 'agents' | 'numbers' | 'sip';

export class QuotaService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** The tenant's quota policy (from settings), with safe defaults. */
  private async policyFor(tenantId: string): Promise<QuotaConfig> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const raw = (t?.settings as { quotaPolicy?: unknown } | null)?.quotaPolicy;
    const parsed = quotaPolicySchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : quotaPolicySchema.parse({});
  }

  /** Current usage of a resource this billing period. */
  private async usage(tenantId: string, resource: QuotaResource): Promise<number> {
    switch (resource) {
      case 'agents':
        return this.db.withTenant(tenantId, (tx) => tx.agent.count());
      case 'numbers':
        return this.db.withTenant(tenantId, (tx) => tx.phoneNumber.count({ where: { tenantId } }));
      case 'sip':
        return this.db.withTenant(tenantId, (tx) => tx.sipTrunk.count());
      default: {
        // Minutes used this calendar month (rounded up from seconds).
        const [row] = await this.db.withTenant(
          tenantId,
          (tx) =>
            tx.$queryRaw<{ mins: number | null }[]>`
              SELECT COALESCE(sum("durationSec"),0)::float / 60 AS mins FROM "Call"
              WHERE "createdAt" >= date_trunc('month', now())`,
        );
        return Math.ceil(Number(row?.mins ?? 0));
      }
    }
  }

  private limitFor(
    resource: QuotaResource,
    ent: { includedMinutes: number; agentLimit: number; numberLimit: number; sipLimit: number },
  ): number {
    switch (resource) {
      case 'agents':
        return ent.agentLimit;
      case 'numbers':
        return ent.numberLimit;
      case 'sip':
        return ent.sipLimit;
      default:
        return ent.includedMinutes;
    }
  }

  /**
   * Evaluate a resource's quota for a tenant. Applies the policy action: on a hard overage with
   * `onHardOverage: 'suspend'` the tenant is suspended (audited); on a threshold crossing a
   * notification is raised once. Returns the pure result so callers can also gate an action.
   */
  async check(
    tenantId: string,
    resource: QuotaResource,
    actorUserId?: string,
  ): Promise<QuotaResult> {
    const [ent, policy] = await Promise.all([
      this.entitlements.entitlements(tenantId),
      this.policyFor(tenantId),
    ]);
    const used = await this.usage(tenantId, resource);
    const limit = this.limitFor(resource, ent);
    const result = evaluateQuota(used, limit, policy);

    if (result.crossedWarn || result.crossedOver) {
      await this.notify(tenantId, resource, result);
    }
    if (result.action === 'suspend') {
      await this.suspend(tenantId, resource, actorUserId ?? null);
    }
    return result;
  }

  /** Gate a create/usage action: throws nothing but returns whether it is allowed. */
  async isAllowed(tenantId: string, resource: QuotaResource): Promise<boolean> {
    const r = await this.check(tenantId, resource);
    return r.action === 'allow' || r.action === 'warn';
  }

  private async notify(tenantId: string, resource: QuotaResource, r: QuotaResult): Promise<void> {
    await this.db.admin.notification.create({
      data: {
        tenantId,
        channel: 'inapp',
        payload: {
          type: r.state === 'over' ? 'quota_exceeded' : 'quota_warning',
          resource,
          used: r.used,
          limit: r.limit,
        } as object,
      },
    });
  }

  private async suspend(
    tenantId: string,
    resource: QuotaResource,
    actorUserId: string | null,
  ): Promise<void> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (t?.status === 'SUSPENDED') return; // idempotent
    await this.db.admin.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
    await this.db.admin.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: 'quota.autosuspend',
        target: resource,
        meta: { resource } as object,
      },
    });
  }
}
