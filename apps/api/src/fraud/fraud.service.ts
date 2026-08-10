import {
  ForbiddenError,
  type FraudPolicy,
  type FraudSignals,
  NotFoundError,
  Role,
  decideFraudResponse,
  fraudPolicySchema,
  kycGate,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Real-time fraud/abuse enforcement (Day 70). Assesses a tenant's live behaviour, escalates to an
 * automated response (throttle → pause campaigns → suspend), opens an auditable `AbuseCase`, and
 * requires a super-admin review before a suspended tenant resumes. Also gates high-volume scaling
 * on KYC. Builds on the Day-64 abuse scoring; the escalation ladder is pure (`decideFraudResponse`).
 * Tenant state changes are audited (self-audit C); reads are scoped (self-audit B).
 */

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

export class FraudService {
  constructor(private readonly db: PrismaService) {}

  private async policy(tenantId: string): Promise<FraudPolicy> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const raw = (t?.settings as { fraudPolicy?: unknown } | null)?.fraudPolicy;
    const parsed = fraudPolicySchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : fraudPolicySchema.parse({});
  }

  /**
   * Evaluate + enforce for a tenant. Gathers signals (or uses the provided override for a targeted
   * check), decides the response, applies it (suspend/pause), opens a case, and audits + notifies
   * the super-admin. Idempotent-ish: an `allow` verdict is a no-op with no case.
   */
  async evaluateAndEnforce(
    tenantId: string,
    override?: Partial<FraudSignals>,
    actorUserId: string | null = null,
  ): Promise<{ action: string; score: number; caseId: string | null }> {
    const signals = { ...(await this.signals(tenantId)), ...override };
    const decision = decideFraudResponse(signals, await this.policy(tenantId));

    if (decision.action === 'allow')
      return { action: 'allow', score: decision.score, caseId: null };

    // Apply the automated response.
    if (decision.action === 'suspend_tenant') {
      await this.db.admin.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } });
    } else if (decision.action === 'pause_campaigns') {
      await this.db.admin.campaign.updateMany({
        where: { tenantId, status: 'RUNNING' },
        data: { status: 'STOPPED' },
      });
    }

    const created = await this.db.admin.abuseCase.create({
      data: {
        tenantId,
        score: decision.score,
        action: decision.action,
        status: 'open',
        reasons: decision.reasons,
      },
      select: { id: true },
    });
    await this.audit(tenantId, actorUserId, 'fraud.enforce', created.id, {
      action: decision.action,
      score: decision.score,
    });
    // Notify the platform operator (super-admin broadcast surface).
    await this.db.admin.notification.create({
      data: {
        tenantId,
        channel: 'inapp',
        payload: { type: 'fraud_case', action: decision.action, score: decision.score } as object,
      },
    });
    return { action: decision.action, score: decision.score, caseId: created.id };
  }

  /** KYC gate for scaling: a new unverified tenant blasting volume must verify first. */
  async assertCanScale(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    const [policy, signals] = await Promise.all([this.policy(tenantId), this.signals(tenantId)]);
    return kycGate(
      {
        kycVerified: signals.kycVerified,
        accountAgeDays: signals.accountAgeDays,
        callsLastHour: signals.callsLastHour,
      },
      policy,
    );
  }

  /** Open fraud cases — super-admin dashboard (owner client spans tenants). */
  async listCases(actor: Actor, status?: string) {
    if (actor.role !== Role.SUPER_ADMIN) {
      // A reseller/admin sees only its own tenant's cases (RLS).
      return this.db.withTenant(actor.tenantId, (tx) =>
        tx.abuseCase.findMany({
          where: status ? { status } : {},
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: CASE_SELECT,
        }),
      );
    }
    return this.db.admin.abuseCase.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: CASE_SELECT,
    });
  }

  /**
   * Super-admin review of a case. `resume` un-suspends the tenant + resolves the case; `dismiss`
   * marks a false positive; otherwise it stays suspended (resolved without resume). Audited.
   */
  async resolveCase(
    actor: Actor,
    caseId: string,
    resolution: 'resume' | 'dismiss' | 'keep_suspended',
    notes?: string,
  ): Promise<{ id: string; status: string }> {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError('Only a super-admin can review a fraud case');
    }
    const c = await this.db.admin.abuseCase.findUnique({
      where: { id: caseId },
      select: { id: true, tenantId: true, action: true },
    });
    if (!c) throw new NotFoundError('Case not found');

    if (resolution === 'resume' || resolution === 'dismiss') {
      // Restore service (only meaningful if it had been suspended/paused).
      await this.db.admin.tenant.update({ where: { id: c.tenantId }, data: { status: 'ACTIVE' } });
    }
    const status = resolution === 'dismiss' ? 'dismissed' : 'resolved';
    const updated = await this.db.admin.abuseCase.update({
      where: { id: caseId },
      data: { status, resolvedBy: actor.userId, resolvedAt: new Date(), notes: notes ?? null },
      select: { id: true, status: true },
    });
    await this.audit(c.tenantId, actor.userId, 'fraud.review', caseId, { resolution });
    return updated;
  }

  private async signals(tenantId: string): Promise<FraudSignals> {
    // Gather the abuse velocity signals (Day 64) directly + the fraud-specific ones available from
    // stored data. DNC hits are blocked pre-dial (retrospective ratio ~0); banned-content + country
    // spread are fed by the override / live counters (not stored per-call today), defaulting safe.
    const [tenant, kyc, agg] = await Promise.all([
      this.db.admin.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } }),
      this.db.admin.phoneNumber.count({ where: { tenantId, kycVerified: true } }),
      this.db.withTenant(
        tenantId,
        (tx) =>
          tx.$queryRaw<
            {
              last_min: number | null;
              last_hour: number | null;
              distinct_dest: number | null;
              short: number | null;
              failed: number | null;
            }[]
          >`
          SELECT
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 minute')::int AS last_min,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour')::int AS last_hour,
            count(DISTINCT "contactId") FILTER (WHERE "createdAt" >= now() - interval '1 hour')::int AS distinct_dest,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour' AND "durationSec" IS NOT NULL AND "durationSec" < 5)::int AS short,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour' AND "status" IN ('FAILED','NO_ANSWER'))::int AS failed
          FROM "Call" WHERE "direction" = 'OUTBOUND'`,
      ),
    ]);
    const row = agg[0] ?? { last_min: 0, last_hour: 0, distinct_dest: 0, short: 0, failed: 0 };
    const lastHour = num(row.last_hour);
    return {
      callsLastMinute: num(row.last_min),
      callsLastHour: lastHour,
      distinctDestinations: num(row.distinct_dest),
      shortCallRatio: lastHour === 0 ? 0 : num(row.short) / lastHour,
      failureRatio: lastHour === 0 ? 0 : num(row.failed) / lastHour,
      accountAgeDays: tenant
        ? Math.floor((Date.now() - tenant.createdAt.getTime()) / 86_400_000)
        : 0,
      kycVerified: kyc > 0,
      // Fraud-specific — DNC hits are blocked pre-dial so retrospective ratio is ~0 here; banned
      // content + country spread aren't stored per-call today (fed by the override / live counters).
      dncHitRatio: 0,
      bannedContentHits: 0,
      distinctCountries: 1,
    };
  }

  private async audit(
    tenantId: string,
    actorUserId: string | null,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ) {
    await this.db.admin.auditLog.create({
      data: { tenantId, actorUserId, action, target, meta: meta as object },
    });
  }
}

const num = (v: number | null | undefined) => Number(v ?? 0);

const CASE_SELECT = {
  id: true,
  tenantId: true,
  score: true,
  action: true,
  status: true,
  reasons: true,
  notes: true,
  createdAt: true,
  resolvedAt: true,
} as const;
