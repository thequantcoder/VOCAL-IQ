import { Capability, NotFoundError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/**
 * Cost attribution engine (golden rule #4). Turns the per-call UsageRecords emitted by
 * the voice loop + router (STT+LLM+TTS+telephony) into authoritative, queryable cost —
 * per call, and rolled up per agent/day/provider/capability — feeding dashboards +
 * reseller margin.
 *
 * History is immutable: each UsageRecord stores the `costUsd` computed at metering time
 * from the versioned price table, so a later rate change never rewrites past cost. BYOK
 * usage is counted in `total` (informational) but excluded from `billable` (the tenant
 * brought their own key, so the platform doesn't charge them the provider cost).
 */

export interface CostBreakdown {
  stt: number;
  llm: number;
  tts: number;
  telephony: number;
  /** All provider cost incurred (managed + BYOK), informational. */
  total: number;
  /** What the tenant is billed — excludes BYOK. */
  billable: number;
}

export interface UsageRow {
  provider: string;
  capability: string;
  units: number;
  costUsd: number;
  byok: boolean;
  ts: Date;
}

export type RollupGroupBy = 'day' | 'capability' | 'provider' | 'agent';

export interface RollupRow {
  key: string;
  totalUsd: number;
  billableUsd: number;
  units: number;
}

interface RawRollupRow {
  key: string | null;
  totalusd: number | null;
  billableusd: number | null;
  units: number | null;
}

function emptyBreakdown(): CostBreakdown {
  return { stt: 0, llm: 0, tts: 0, telephony: 0, total: 0, billable: 0 };
}

export class CostService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Sum a call's UsageRecords into `Call.costBreakdown` and return it. Recomputed from
   * the immutable records so it's always accurate (called live per segment + at call end).
   */
  async aggregateCall(tenantId: string, callId: string): Promise<CostBreakdown> {
    return this.db.withTenant(tenantId, async (tx) => {
      const call = await tx.call.findFirst({ where: { id: callId }, select: { id: true } });
      if (!call) throw new NotFoundError('Call not found');

      const records = await tx.usageRecord.findMany({
        where: { callId },
        select: { capability: true, costUsd: true, byok: true },
      });

      const bd = emptyBreakdown();
      for (const r of records) {
        if (r.capability === Capability.STT) bd.stt += r.costUsd;
        else if (r.capability === Capability.LLM) bd.llm += r.costUsd;
        else if (r.capability === Capability.TTS) bd.tts += r.costUsd;
        else if (r.capability === Capability.TELEPHONY) bd.telephony += r.costUsd;
        bd.total += r.costUsd;
        if (!r.byok) bd.billable += r.costUsd;
      }
      roundBreakdown(bd);

      // Prisma JSON columns want a plain indexable object.
      const json: Record<string, number> = { ...bd };
      await tx.call.update({ where: { id: callId }, data: { costBreakdown: json } });
      return bd;
    });
  }

  /** Per-call detail: the (recomputed) breakdown + the underlying usage records. */
  async callCost(
    tenantId: string,
    callId: string,
  ): Promise<{ callId: string; breakdown: CostBreakdown; records: UsageRow[] }> {
    const breakdown = await this.aggregateCall(tenantId, callId);
    const records = await this.db.withTenant(tenantId, (tx) =>
      tx.usageRecord.findMany({
        where: { callId },
        select: {
          provider: true,
          capability: true,
          units: true,
          costUsd: true,
          byok: true,
          ts: true,
        },
        orderBy: { ts: 'asc' },
      }),
    );
    return { callId, breakdown, records };
  }

  /**
   * Roll up usage over a date range, grouped by day (Timescale `time_bucket`), capability,
   * provider, or agent. Runs under RLS so it only ever sees the caller's tenant. Only the
   * date bounds are interpolated (parameterized); each grouping is a distinct static query.
   */
  async rollup(
    tenantId: string,
    params: { from: Date; to: Date; groupBy: RollupGroupBy },
  ): Promise<RollupRow[]> {
    const { from, to, groupBy } = params;
    return this.db.withTenant(tenantId, async (tx) => {
      let rows: RawRollupRow[];
      if (groupBy === 'agent') {
        rows = await tx.$queryRaw<RawRollupRow[]>`
          SELECT c."agentId"::text AS key,
                 sum(u."costUsd") AS totalusd,
                 sum(CASE WHEN u."byok" THEN 0 ELSE u."costUsd" END) AS billableusd,
                 sum(u."units") AS units
          FROM "UsageRecord" u JOIN "Call" c ON c.id = u."callId"
          WHERE u."ts" >= ${from} AND u."ts" < ${to}
          GROUP BY c."agentId" ORDER BY totalusd DESC`;
      } else if (groupBy === 'day') {
        rows = await tx.$queryRaw<RawRollupRow[]>`
          SELECT to_char(time_bucket('1 day', u."ts"), 'YYYY-MM-DD') AS key,
                 sum(u."costUsd") AS totalusd,
                 sum(CASE WHEN u."byok" THEN 0 ELSE u."costUsd" END) AS billableusd,
                 sum(u."units") AS units
          FROM "UsageRecord" u
          WHERE u."ts" >= ${from} AND u."ts" < ${to}
          GROUP BY 1 ORDER BY 1`;
      } else if (groupBy === 'capability') {
        rows = await tx.$queryRaw<RawRollupRow[]>`
          SELECT u."capability"::text AS key,
                 sum(u."costUsd") AS totalusd,
                 sum(CASE WHEN u."byok" THEN 0 ELSE u."costUsd" END) AS billableusd,
                 sum(u."units") AS units
          FROM "UsageRecord" u
          WHERE u."ts" >= ${from} AND u."ts" < ${to}
          GROUP BY 1 ORDER BY totalusd DESC`;
      } else {
        rows = await tx.$queryRaw<RawRollupRow[]>`
          SELECT u."provider"::text AS key,
                 sum(u."costUsd") AS totalusd,
                 sum(CASE WHEN u."byok" THEN 0 ELSE u."costUsd" END) AS billableusd,
                 sum(u."units") AS units
          FROM "UsageRecord" u
          WHERE u."ts" >= ${from} AND u."ts" < ${to}
          GROUP BY 1 ORDER BY totalusd DESC`;
      }

      return rows.map((r) => ({
        key: r.key ?? 'unknown',
        totalUsd: round6(Number(r.totalusd ?? 0)),
        billableUsd: round6(Number(r.billableusd ?? 0)),
        units: Number(r.units ?? 0),
      }));
    });
  }

  /**
   * Reconciliation (the "no un-metered call" invariant): COMPLETED calls that ran the
   * agent but carry zero UsageRecords indicate a metering leak. Returns the offending
   * call ids so a worker can alarm + backfill (self-audit D).
   */
  async reconcile(
    tenantId: string,
    params: { from: Date; to: Date },
  ): Promise<{ checked: number; unmeteredCallIds: string[] }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const completed = await tx.call.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: params.from, lt: params.to } },
        select: { id: true },
      });
      const unmetered: string[] = [];
      for (const c of completed) {
        const count = await tx.usageRecord.count({ where: { callId: c.id } });
        if (count === 0) unmetered.push(c.id);
      }
      return { checked: completed.length, unmeteredCallIds: unmetered };
    });
  }
}

function roundBreakdown(bd: CostBreakdown): void {
  bd.stt = round6(bd.stt);
  bd.llm = round6(bd.llm);
  bd.tts = round6(bd.tts);
  bd.telephony = round6(bd.telephony);
  bd.total = round6(bd.total);
  bd.billable = round6(bd.billable);
}

/** Round to 6 dp (sub-cent provider costs) to avoid float dust in stored totals. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
