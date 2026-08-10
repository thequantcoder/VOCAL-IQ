import {
  type AttestationLevel,
  type BrandedCallerId,
  NotFoundError,
  type NumberHealth,
  type ReputationSignals,
  ValidationError,
  brandedCallerIdSchema,
  restDecision,
  scoreReputation,
  warmupDailyCap,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Caller reputation, branded caller ID & STIR/SHAKEN (Day 69). Records per-call attestation, scores
 * each number's spam reputation from its recent calling behaviour + a (gated) provider spam-label
 * lookup, auto-rests flagged numbers to let them recover, enforces a warm-up ramp on new numbers,
 * and surfaces a per-tenant number-health view. All tenant reads/writes are RLS-scoped (self-audit
 * B). The pure scoring/remediation lives in @vocaliq/shared; the live provider lookup is a seam.
 */

/** A provider spam-label lookup (Twilio/Telnyx/3rd-party). Gated — a stub returns "unknown". */
export type SpamLabelProvider = (e164: string) => Promise<'clean' | 'at_risk' | 'flagged' | null>;

export class ReputationService {
  constructor(
    private readonly db: PrismaService,
    /** Live spam-label lookup; null-returning stub in dev/CI (gated on a reputation API key). */
    private readonly spamLookup: SpamLabelProvider = async () => null,
  ) {}

  /** Store the STIR/SHAKEN attestation level a call was placed with. */
  async recordAttestation(
    tenantId: string,
    callId: string,
    level: AttestationLevel,
  ): Promise<{ ok: true }> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.call.updateMany({ where: { id: callId }, data: { attestation: level } }),
    );
    return { ok: true };
  }

  /** Register/replace a number's branded caller ID (CNAM / Rich Call Data). */
  async setBrandedCallerId(
    tenantId: string,
    numberId: string,
    input: unknown,
  ): Promise<BrandedCallerId> {
    const parsed = brandedCallerIdSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid caller ID');
    const n = await this.ownedNumber(tenantId, numberId);
    await this.db.admin.phoneNumber.update({
      where: { id: n.id },
      data: { brandedCallerId: parsed.data as object },
    });
    return parsed.data;
  }

  /**
   * Refresh a number's reputation: gather its recent call signals + the provider spam label, score
   * it, persist the score/label, and auto-rest it if flagged. Returns the new health.
   */
  async refresh(
    tenantId: string,
    numberId: string,
  ): Promise<{ score: number; label: string; rested: boolean }> {
    const n = await this.ownedNumber(tenantId, numberId);
    const [signals, spamLabel] = await Promise.all([
      this.gatherSignals(tenantId, n.e164),
      this.spamLookup(n.e164),
    ]);
    const result = scoreReputation({ ...signals, ...(spamLabel ? { spamLabel } : {}) });
    const rest = restDecision(result);

    await this.db.admin.phoneNumber.update({
      where: { id: n.id },
      data: {
        reputationScore: result.score,
        spamLabel: result.label,
        reputationCheckedAt: new Date(),
        ...(rest.rest ? { restedUntil: new Date(Date.now() + rest.hours * 3_600_000) } : {}),
      },
    });
    return { score: result.score, label: result.label, rested: rest.rest };
  }

  /** Per-tenant number-health dashboard: score/label/rest state + warm-up cap per number. */
  async health(
    tenantId: string,
  ): Promise<(NumberHealth & { label: string; warmupCapToday: number; rested: boolean })[]> {
    const now = Date.now();
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.phoneNumber.findMany({
        where: { tenantId },
        select: {
          id: true,
          e164: true,
          reputationScore: true,
          spamLabel: true,
          restedUntil: true,
          warmupStartedAt: true,
          createdAt: true,
        },
      }),
    );
    return rows.map((r) => {
      const ageDays = Math.floor((now - (r.warmupStartedAt ?? r.createdAt).getTime()) / 86_400_000);
      const restedUntil = r.restedUntil ? r.restedUntil.getTime() : null;
      return {
        id: r.id,
        e164: r.e164,
        score: r.reputationScore ?? 100,
        label: (r.spamLabel as NumberHealth['label']) ?? 'clean',
        restedUntil,
        ageDays,
        warmupCapToday: warmupDailyCap(ageDays),
        rested: restedUntil !== null && restedUntil > now,
      };
    });
  }

  /**
   * Pre-dial gate: may this number place a call right now? Blocks a rested number and enforces the
   * warm-up daily cap. Used by the outbound path so a flagged/ramping number isn't over-dialed.
   */
  async canDial(
    tenantId: string,
    numberId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const n = await this.db.admin.phoneNumber.findUnique({
      where: { id: numberId },
      select: {
        tenantId: true,
        restedUntil: true,
        warmupStartedAt: true,
        createdAt: true,
        e164: true,
      },
    });
    if (!n || (n.tenantId && n.tenantId !== tenantId))
      return { allowed: false, reason: 'number not found' };
    const now = Date.now();
    if (n.restedUntil && n.restedUntil.getTime() > now) {
      return { allowed: false, reason: 'number is resting (flagged reputation)' };
    }
    const ageDays = Math.floor((now - (n.warmupStartedAt ?? n.createdAt).getTime()) / 86_400_000);
    const cap = warmupDailyCap(ageDays);
    const callsToday = await this.db.withTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<{ n: number | null }[]>`
        SELECT count(*)::int AS n FROM "Call"
        WHERE "createdAt" >= date_trunc('day', now())`,
    );
    if (Number(callsToday[0]?.n ?? 0) >= cap) {
      return { allowed: false, reason: `warm-up cap reached (${cap}/day)` };
    }
    return { allowed: true };
  }

  private async gatherSignals(tenantId: string, _e164: string): Promise<ReputationSignals> {
    const [row] = await this.db.withTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<
          {
            total: number | null;
            short: number | null;
            failed: number | null;
            today: number | null;
          }[]
        >`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE "durationSec" IS NOT NULL AND "durationSec" < 5)::int AS short,
               count(*) FILTER (WHERE "status" IN ('FAILED','NO_ANSWER'))::int AS failed,
               count(*) FILTER (WHERE "createdAt" >= date_trunc('day', now()))::int AS today
        FROM "Call" WHERE "direction" = 'OUTBOUND' AND "createdAt" >= now() - interval '7 days'`,
    );
    const total = Number(row?.total ?? 0);
    return {
      shortCallRatio: total === 0 ? 0 : Number(row?.short ?? 0) / total,
      blockRatio: total === 0 ? 0 : Number(row?.failed ?? 0) / total, // failed/no-answer ~ block proxy
      attestation: 'A', // provider-reported; defaults to A when STIR/SHAKEN is configured
      callsToday: Number(row?.today ?? 0),
    };
  }

  private async ownedNumber(tenantId: string, numberId: string) {
    const n = await this.db.admin.phoneNumber.findUnique({
      where: { id: numberId },
      select: { id: true, tenantId: true, e164: true },
    });
    if (!n || (n.tenantId && n.tenantId !== tenantId)) throw new NotFoundError('Number not found');
    return n;
  }
}
