import {
  type AbusePolicy,
  type AbuseVerdict,
  abusePolicySchema,
  evaluateAbuse,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Anti-spam / anti-robocall abuse detection (Day 64). Gathers a tenant's recent calling behaviour
 * (counts + ratios only — no PII) and scores it with the pure `evaluateAbuse` heuristics, so the
 * platform can throttle/block a spam or robocall pattern before it hurts carrier reputation
 * (self-audit C). RLS-scoped (self-audit B). The verdict is enforced pre-call by the outbound gate.
 */
export class AbuseService {
  constructor(private readonly db: PrismaService) {}

  private async policy(tenantId: string): Promise<AbusePolicy> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const raw = (t?.settings as { abusePolicy?: unknown } | null)?.abusePolicy;
    const parsed = abusePolicySchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : abusePolicySchema.parse({});
  }

  /** Assess a tenant's current abuse risk from its recent outbound behaviour. */
  async assess(tenantId: string): Promise<AbuseVerdict> {
    const [signals, policy] = await Promise.all([this.signals(tenantId), this.policy(tenantId)]);
    return evaluateAbuse(signals, policy);
  }

  private async signals(tenantId: string) {
    const [tenant, kycNumbers, agg] = await Promise.all([
      this.db.admin.tenant.findUnique({
        where: { id: tenantId },
        select: { createdAt: true },
      }),
      // A tenant counts as KYC-verified once it holds at least one KYC-verified number (Day 49).
      this.db.admin.phoneNumber.count({ where: { tenantId, kycVerified: true } }),
      this.db.withTenant(
        tenantId,
        (tx) =>
          tx.$queryRaw<
            {
              last_min: number | null;
              last_hour: number | null;
              distinct_dest: number | null;
              short_calls: number | null;
              failed_calls: number | null;
            }[]
          >`
          SELECT
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 minute')::int AS last_min,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour')::int   AS last_hour,
            count(DISTINCT "contactId") FILTER (WHERE "createdAt" >= now() - interval '1 hour')::int AS distinct_dest,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour'
              AND "durationSec" IS NOT NULL AND "durationSec" < 5)::int AS short_calls,
            count(*) FILTER (WHERE "createdAt" >= now() - interval '1 hour'
              AND "status" IN ('FAILED','NO_ANSWER'))::int AS failed_calls
          FROM "Call" WHERE "direction" = 'OUTBOUND'`,
      ),
    ]);
    const row = agg[0] ?? {
      last_min: 0,
      last_hour: 0,
      distinct_dest: 0,
      short_calls: 0,
      failed_calls: 0,
    };
    const lastHour = num(row.last_hour);
    return {
      callsLastMinute: num(row.last_min),
      callsLastHour: lastHour,
      distinctDestinations: num(row.distinct_dest),
      shortCallRatio: lastHour === 0 ? 0 : num(row.short_calls) / lastHour,
      failureRatio: lastHour === 0 ? 0 : num(row.failed_calls) / lastHour,
      accountAgeDays: tenant
        ? Math.floor((Date.now() - tenant.createdAt.getTime()) / 86_400_000)
        : 0,
      kycVerified: kycNumbers > 0,
    };
  }
}

const num = (v: number | null | undefined) => Number(v ?? 0);
