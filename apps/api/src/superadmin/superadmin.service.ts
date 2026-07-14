import type { Prisma, TenantStatus } from '@vocaliq/db';
import {
  type AnnouncementAudience,
  type AnnouncementInput,
  NotFoundError,
  type PlatformOverview,
  type ServiceHealth,
  type TenantSearch,
  aggregatePlatformOverview,
  deriveHealthStatus,
} from '@vocaliq/shared';
import { signImpersonationToken } from '../auth/jwt';
import type { PrismaService } from '../db/prisma.service';

/**
 * Super-admin control plane (Day 55) — the platform owner's view ACROSS all tenants. Every read
 * here legitimately spans tenants, so it uses the owner (`admin`) client; this is safe ONLY
 * because every route is SUPER_ADMIN-gated at the API layer (self-audit B + C — the privileged
 * bypass is reachable through exactly one audited door). Mutations (status changes, impersonation)
 * write an `AuditLog` row so the operator's actions are always accountable.
 */

/** A probe for the combined worker-queue backlog (BullMQ). Injected so the API has no hard Redis
 *  dependency; defaults to 0 (unknown → treated as no visible backlog, surfaced as such). */
export type QueueDepthProbe = () => Promise<number>;

/** Prisma P2003 = a foreign-key constraint violation (e.g. a referenced tenant no longer exists). */
const isForeignKeyViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2003';

export interface TenantListRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentTenantId: string | null;
  createdAt: Date;
}

export interface TenantDetail extends TenantListRow {
  ownerEmail: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  walletBalanceCents: number;
  agentCount: number;
  callCount: number;
}

export interface AuditRow {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  ts: Date;
}

export interface ImpersonationGrant {
  token: string;
  tenantId: string;
  expiresInSeconds: number;
}

export class SuperAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly queueDepthProbe: QueueDepthProbe = async () => 0,
  ) {}

  /** Global tenant/reseller search (paginated). Owner client — SUPER_ADMIN-gated at the route. */
  async listTenants(
    s: TenantSearch,
  ): Promise<{ items: TenantListRow[]; total: number; page: number; pageSize: number }> {
    const where = {
      ...(s.type ? { type: s.type } : {}),
      ...(s.status ? { status: s.status } : {}),
      ...(s.query
        ? {
            OR: [
              { name: { contains: s.query, mode: 'insensitive' as const } },
              { slug: { contains: s.query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.admin.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (s.page - 1) * s.pageSize,
        take: s.pageSize,
        select: LIST_SELECT,
      }),
      this.db.admin.tenant.count({ where }),
    ]);
    return { items, total, page: s.page, pageSize: s.pageSize };
  }

  async getTenant(id: string): Promise<TenantDetail> {
    const t = await this.db.admin.tenant.findUnique({ where: { id }, select: LIST_SELECT });
    if (!t) throw new NotFoundError('Tenant not found');

    const [ownerMembership, subscription, wallet, agentCount, callCount] = await Promise.all([
      this.db.admin.membership.findFirst({
        where: { tenantId: id, role: 'OWNER' },
        select: { user: { select: { email: true } } },
      }),
      this.db.admin.subscription.findFirst({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        select: { status: true, plan: { select: { name: true } } },
      }),
      this.db.admin.wallet.findUnique({ where: { tenantId: id }, select: { balanceCents: true } }),
      this.db.admin.agent.count({ where: { tenantId: id } }),
      this.db.admin.call.count({ where: { tenantId: id } }),
    ]);

    return {
      ...t,
      ownerEmail: ownerMembership?.user?.email ?? null,
      planName: subscription?.plan?.name ?? null,
      subscriptionStatus: subscription?.status ?? null,
      walletBalanceCents: wallet?.balanceCents ?? 0,
      agentCount,
      callCount,
    };
  }

  /** Suspend / reactivate ANY tenant — a privileged platform action, always audited. */
  async setTenantStatus(
    actorUserId: string,
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<TenantListRow> {
    const t = await this.db.admin.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!t) throw new NotFoundError('Tenant not found');
    const updated = await this.db.admin.tenant.update({
      where: { id },
      data: { status },
      select: LIST_SELECT,
    });
    await this.audit(id, actorUserId, 'superadmin.tenant.status', id, { status });
    return updated;
  }

  /**
   * Platform-wide money for a period: gross revenue, provider cost, margin (from the SAME
   * `ResellerMargin` rows the wallet engine writes — ties out, self-audit D) plus the tenant
   * census. Owner client; SUPER_ADMIN-gated.
   */
  async platformOverview(period: string): Promise<PlatformOverview> {
    const [margins, census] = await Promise.all([
      this.db.admin.resellerMargin.findMany({
        where: { period },
        select: { resellerTenantId: true, revenue: true, cost: true },
      }),
      this.tenantCensus(),
    ]);
    return aggregatePlatformOverview(
      period,
      margins.map((m) => ({
        resellerTenantId: m.resellerTenantId,
        revenueCents: m.revenue,
        costCents: m.cost,
      })),
      census,
    );
  }

  private async tenantCensus() {
    const rows = await this.db.admin.tenant.groupBy({
      by: ['type', 'status'],
      _count: { _all: true },
    });
    const census = { total: 0, resellers: 0, customers: 0, active: 0, suspended: 0, trial: 0 };
    for (const r of rows) {
      const n = r._count._all;
      census.total += n;
      if (r.type === 'RESELLER') census.resellers += n;
      if (r.type === 'CUSTOMER') census.customers += n;
      if (r.status === 'ACTIVE') census.active += n;
      if (r.status === 'SUSPENDED') census.suspended += n;
      if (r.status === 'TRIAL') census.trial += n;
    }
    return census;
  }

  /**
   * System health traffic-light: DB reachability (a real probe), worker-queue backlog (injected
   * probe — best-effort, 0 if no Redis), and the recent call error rate across the platform.
   * The overall status is the WORST band (pure `deriveHealthStatus`).
   */
  async systemHealth(): Promise<{ overall: string; services: ServiceHealth[] }> {
    let dbOk = true;
    try {
      await this.db.admin.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    let queueDepth = 0;
    let queueKnown = true;
    try {
      queueDepth = await this.queueDepthProbe();
    } catch {
      queueKnown = false;
    }

    const errorRate = dbOk ? await this.recentErrorRate() : 1;
    const overall = deriveHealthStatus({ dbOk, queueDepth, errorRate });

    const services: ServiceHealth[] = [
      {
        name: 'database',
        status: dbOk ? 'ok' : 'down',
        detail: dbOk ? 'reachable' : 'unreachable',
      },
      {
        name: 'workers',
        status: deriveHealthStatus({ dbOk: true, queueDepth, errorRate: 0 }),
        detail: queueKnown ? `${queueDepth} jobs queued` : 'queue depth unavailable',
      },
      {
        name: 'calls',
        status: deriveHealthStatus({ dbOk: true, queueDepth: 0, errorRate }),
        detail: `${(errorRate * 100).toFixed(1)}% recent failures`,
      },
    ];
    return { overall, services };
  }

  /** Fraction of calls in the last hour that failed (platform-wide) — 0 when there were none. */
  private async recentErrorRate(): Promise<number> {
    const [row] = await this.db.admin.$queryRaw<{ total: number | null; failed: number | null }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "status" IN ('FAILED','NO_ANSWER'))::int AS failed
      FROM "Call" WHERE "createdAt" >= now() - interval '1 hour'`;
    const total = Number(row?.total ?? 0);
    return total === 0 ? 0 : Number(row?.failed ?? 0) / total;
  }

  /**
   * Mint a short-lived, audited impersonation grant. The actor MUST be a super-admin (verified
   * when the grant is USED, via tenantMiddleware→resolveImpersonation — fail-closed) and the
   * target tenant must exist. We record the grant on the TARGET tenant's audit trail with the
   * actor + reason, so there's always a paper trail before any impersonated action occurs.
   */
  async impersonate(
    actorUserId: string,
    input: { tenantId: string; reason: string },
  ): Promise<ImpersonationGrant> {
    const target = await this.db.admin.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!target) throw new NotFoundError('Tenant not found');

    await this.audit(input.tenantId, actorUserId, 'superadmin.impersonate', input.tenantId, {
      reason: input.reason,
    });
    const ttl = 30 * 60;
    return {
      token: signImpersonationToken(actorUserId, input.tenantId, ttl),
      tenantId: input.tenantId,
      expiresInSeconds: ttl,
    };
  }

  /** Recent audit entries — platform-wide, or scoped to one tenant. Owner client, SUPER_ADMIN. */
  async listAudit(tenantId?: string, limit = 100): Promise<AuditRow[]> {
    return this.db.admin.auditLog.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { ts: 'desc' },
      take: Math.min(limit, 500),
      select: AUDIT_SELECT,
    });
  }

  /**
   * Resolve an announcement audience to concrete tenant ids (owner client — the platform sees the
   * whole tree). The platform tenant itself is always excluded; only ACTIVE/TRIAL tenants are targeted.
   * Public so the composer can preview reach and so audience resolution stays unit-testable without
   * doing a broad fan-out.
   */
  async resolveAudienceTenantIds(audience: AnnouncementAudience): Promise<string[]> {
    const liveStatuses: TenantStatus[] = ['ACTIVE', 'TRIAL'];
    if (audience.scope === 'tenants') return audience.tenantIds;

    if (audience.scope === 'plan') {
      const subs = await this.db.admin.subscription.findMany({
        where: { planId: audience.planId, status: 'ACTIVE' },
        select: { tenantId: true },
      });
      return [...new Set(subs.map((s) => s.tenantId))];
    }

    const where: Prisma.TenantWhereInput = { status: { in: liveStatuses } };
    if (audience.scope === 'customers') {
      where.type = 'CUSTOMER';
    } else if (audience.scope === 'reseller') {
      where.OR = [{ id: audience.resellerId }, { parentTenantId: audience.resellerId }];
    } else {
      // 'all' — every non-platform tenant.
      where.type = { not: 'PLATFORM' };
    }

    const rows = await this.db.admin.tenant.findMany({ where, select: { id: true } });
    return rows.map((t) => t.id);
  }

  /**
   * Publish a platform-wide announcement: resolve the audience, drop one broadcast Notification per
   * target tenant (owner client), and write an AuditLog of the cross-tenant fan-out. Tenants read
   * their own via the RLS-scoped notifications endpoint.
   */
  async broadcastAnnouncement(
    actorUserId: string,
    actorTenantId: string,
    input: AnnouncementInput,
  ): Promise<{ sent: number }> {
    const tenantIds = await this.resolveAudienceTenantIds(input.audience);
    const sent = await this.fanOutBroadcast(tenantIds, input);
    await this.audit(actorTenantId, actorUserId, 'superadmin.announcement.sent', null, {
      audience: input.audience,
      severity: input.severity,
      sent,
    });
    return { sent };
  }

  /**
   * Fan a broadcast out to the resolved tenants (one Notification each). Resilient to a target tenant
   * that is hard-deleted between resolve and insert: a broad broadcast must not fail because a single
   * target vanished, so on a foreign-key violation we re-filter to still-existing tenants and retry
   * once. Returns the number of notifications actually written (what the audit records).
   */
  private async fanOutBroadcast(tenantIds: string[], input: AnnouncementInput): Promise<number> {
    if (tenantIds.length === 0) return 0;
    const rows = (ids: string[]) =>
      ids.map((tenantId) => ({
        tenantId,
        channel: 'broadcast',
        payload: {
          type: 'broadcast',
          severity: input.severity,
          message: input.message,
        } as object,
      }));
    try {
      await this.db.admin.notification.createMany({ data: rows(tenantIds) });
      return tenantIds.length;
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      const alive = await this.db.admin.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true },
      });
      if (alive.length === 0) return 0;
      await this.db.admin.notification.createMany({ data: rows(alive.map((t) => t.id)) });
      return alive.length;
    }
  }

  private async audit(
    tenantId: string,
    actorUserId: string,
    action: string,
    target: string | null,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.admin.auditLog.create({
      data: { tenantId, actorUserId, action, target, meta: meta as object },
    });
  }
}

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  status: true,
  parentTenantId: true,
  createdAt: true,
} as const;

const AUDIT_SELECT = {
  id: true,
  tenantId: true,
  actorUserId: true,
  action: true,
  target: true,
  meta: true,
  ts: true,
} as const;
