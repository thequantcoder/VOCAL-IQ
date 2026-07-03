import {
  type BudgetStatus,
  type TalkListen,
  type TranscriptSegment,
  countInterruptions,
  evaluateBudget,
  talkListen,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/**
 * Operator analytics (Day 41). Live + historical numbers via fast, RLS-scoped Timescale
 * aggregations (`time_bucket`). Heavy aggregation stays in SQL; the per-call conversational
 * metrics (talk/listen, interruptions) reuse the pure `@vocaliq/shared` fns over a bounded
 * sample. Everything runs inside `withTenant`, so a tenant only ever sees its own numbers.
 */

export interface LiveSnapshot {
  activeCalls: number; // concurrency right now
  minutesToday: number;
  spendTodayUsd: number;
  callsToday: number;
  successRateToday: number;
}

export interface DayPoint {
  day: string; // YYYY-MM-DD
  value: number;
}

export interface HistoricalAnalytics {
  from: string;
  to: string;
  totalCalls: number;
  totalMinutes: number;
  successRate: number;
  outcomes: Record<string, number>;
  sentimentTrend: DayPoint[];
  costByDay: DayPoint[];
  callsByDay: DayPoint[];
  talkListen: TalkListen;
  avgInterruptions: number;
  dropOffRate: number; // calls that ended very short / unanswered
}

interface CountRow {
  n: number | null;
}
interface NumRow {
  v: number | null;
}
interface OutcomeSqlRow {
  key: string;
  n: number | null;
}
interface DayRow {
  day: string;
  v: number | null;
}

const num = (v: number | null | undefined) => Number(v ?? 0);

export class AnalyticsService {
  constructor(private readonly db: PrismaService) {}

  /** Live operator tiles — concurrency + today's minutes / spend / success. */
  async live(tenantId: string): Promise<LiveSnapshot> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [active] = await tx.$queryRaw<CountRow[]>`
        SELECT count(*)::int AS n FROM "Call"
        WHERE "status" IN ('QUEUED','RINGING','IN_PROGRESS')`;
      const [today] = await tx.$queryRaw<
        { calls: number | null; minutes: number | null; ok: number | null }[]
      >`
        SELECT count(*)::int AS calls,
               COALESCE(sum("durationSec"),0)::float / 60 AS minutes,
               count(*) FILTER (WHERE "status" = 'COMPLETED')::int AS ok
        FROM "Call" WHERE "createdAt" >= date_trunc('day', now())`;
      const [spend] = await tx.$queryRaw<NumRow[]>`
        SELECT COALESCE(sum("costUsd"),0)::float AS v FROM "UsageRecord"
        WHERE "ts" >= date_trunc('day', now())`;

      const calls = num(today?.calls);
      return {
        activeCalls: num(active?.n),
        minutesToday: Math.round(num(today?.minutes) * 10) / 10,
        spendTodayUsd: num(spend?.v),
        callsToday: calls,
        successRateToday: calls === 0 ? 0 : num(today?.ok) / calls,
      };
    });
  }

  /** Historical analytics over a date range, optionally filtered to one agent. */
  async historical(
    tenantId: string,
    params: { from: Date; to: Date; agentId?: string },
  ): Promise<HistoricalAnalytics> {
    const { from, to } = params;
    const agentId = params.agentId ?? null;

    return this.db.withTenant(tenantId, async (tx) => {
      const [totals] = await tx.$queryRaw<
        {
          calls: number | null;
          minutes: number | null;
          ok: number | null;
          dropped: number | null;
        }[]
      >`
        SELECT count(*)::int AS calls,
               COALESCE(sum("durationSec"),0)::float / 60 AS minutes,
               count(*) FILTER (WHERE "status" = 'COMPLETED')::int AS ok,
               count(*) FILTER (WHERE "status" IN ('NO_ANSWER','FAILED')
                                 OR ("durationSec" IS NOT NULL AND "durationSec" < 10))::int AS dropped
        FROM "Call"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          AND (${agentId}::uuid IS NULL OR "agentId" = ${agentId}::uuid)`;

      const outcomeRows = await tx.$queryRaw<OutcomeSqlRow[]>`
        SELECT COALESCE("disposition", "status"::text) AS key, count(*)::int AS n
        FROM "Call"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          AND (${agentId}::uuid IS NULL OR "agentId" = ${agentId}::uuid)
        GROUP BY 1 ORDER BY n DESC`;

      const sentimentRows = await tx.$queryRaw<DayRow[]>`
        SELECT to_char(time_bucket('1 day', "createdAt"), 'YYYY-MM-DD') AS day,
               avg("sentiment")::float AS v
        FROM "Call"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND "sentiment" IS NOT NULL
          AND (${agentId}::uuid IS NULL OR "agentId" = ${agentId}::uuid)
        GROUP BY 1 ORDER BY 1`;

      const callsByDayRows = await tx.$queryRaw<DayRow[]>`
        SELECT to_char(time_bucket('1 day', "createdAt"), 'YYYY-MM-DD') AS day,
               count(*)::float AS v
        FROM "Call"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          AND (${agentId}::uuid IS NULL OR "agentId" = ${agentId}::uuid)
        GROUP BY 1 ORDER BY 1`;

      const costByDayRows = await tx.$queryRaw<DayRow[]>`
        SELECT to_char(time_bucket('1 day', u."ts"), 'YYYY-MM-DD') AS day,
               sum(u."costUsd")::float AS v
        FROM "UsageRecord" u
        JOIN "Call" c ON c.id = u."callId"
        WHERE u."ts" >= ${from} AND u."ts" < ${to}
          AND (${agentId}::uuid IS NULL OR c."agentId" = ${agentId}::uuid)
        GROUP BY 1 ORDER BY 1`;

      // Conversational metrics over a bounded sample of transcripts (perf — self-audit F).
      const sample = await tx.$queryRaw<{ segments: unknown }[]>`
        SELECT t."segments" FROM "Transcript" t JOIN "Call" c ON c.id = t."callId"
        WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to}
          AND (${agentId}::uuid IS NULL OR c."agentId" = ${agentId}::uuid)
        ORDER BY c."createdAt" DESC LIMIT 500`;

      let agentMs = 0;
      let callerMs = 0;
      let interruptions = 0;
      for (const row of sample) {
        const segs = Array.isArray(row.segments) ? (row.segments as TranscriptSegment[]) : [];
        const tl = talkListen(segs);
        agentMs += tl.agentMs;
        callerMs += tl.callerMs;
        interruptions += countInterruptions(segs);
      }
      const totalTalk = agentMs + callerMs;
      const calls = num(totals?.calls);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        totalCalls: calls,
        totalMinutes: Math.round(num(totals?.minutes) * 10) / 10,
        successRate: calls === 0 ? 0 : num(totals?.ok) / calls,
        outcomes: Object.fromEntries(outcomeRows.map((r) => [r.key, num(r.n)])),
        sentimentTrend: sentimentRows.map((r) => ({ day: r.day, value: num(r.v) })),
        costByDay: costByDayRows.map((r) => ({ day: r.day, value: num(r.v) })),
        callsByDay: callsByDayRows.map((r) => ({ day: r.day, value: num(r.v) })),
        talkListen: {
          agentMs,
          callerMs,
          agentRatio: totalTalk === 0 ? 0 : agentMs / totalTalk,
        },
        avgInterruptions: sample.length === 0 ? 0 : interruptions / sample.length,
        dropOffRate: calls === 0 ? 0 : num(totals?.dropped) / calls,
      };
    });
  }

  /**
   * Spend / budget status: today + month spend, a trailing-7-day average for anomaly
   * detection, evaluated against optional caps. Drives the budget-alert surface.
   */
  async budget(
    tenantId: string,
    limits: { dailyLimitUsd?: number | null; monthlyLimitUsd?: number | null } = {},
  ): Promise<BudgetStatus> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [today] = await tx.$queryRaw<NumRow[]>`
        SELECT COALESCE(sum("costUsd"),0)::float AS v FROM "UsageRecord"
        WHERE "ts" >= date_trunc('day', now())`;
      const [month] = await tx.$queryRaw<NumRow[]>`
        SELECT COALESCE(sum("costUsd"),0)::float AS v FROM "UsageRecord"
        WHERE "ts" >= date_trunc('month', now())`;
      // Average daily spend over the 7 days before today.
      const [trailing] = await tx.$queryRaw<NumRow[]>`
        SELECT COALESCE(sum("costUsd"),0)::float / 7 AS v FROM "UsageRecord"
        WHERE "ts" >= date_trunc('day', now()) - interval '7 days'
          AND "ts" < date_trunc('day', now())`;

      return evaluateBudget({
        todaySpendUsd: num(today?.v),
        monthSpendUsd: num(month?.v),
        dailyLimitUsd: limits.dailyLimitUsd ?? null,
        monthlyLimitUsd: limits.monthlyLimitUsd ?? null,
        trailingDailyAvgUsd: num(trailing?.v),
      });
    });
  }
}
