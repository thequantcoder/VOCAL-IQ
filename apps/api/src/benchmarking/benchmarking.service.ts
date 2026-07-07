import {
  BENCHMARK_METRICS,
  type BenchmarkMetricKey,
  type BenchmarkSettings,
  INDUSTRIES,
  type Industry,
  type MetricValues,
  type PeerSummary,
  type Recommendation,
  ValidationError,
  benchmarkSettingsSchema,
  peerCohortSufficient,
  percentileRank,
  recommendationsFrom,
  summarize,
  toPeerSummary,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Multi-agent analytics benchmarking (Day 86). Tenants compare their agents against their OWN history
 * (internal — which agent leads/lags each metric) and, if they opt in, against ANONYMIZED peer averages
 * for their industry. Guarantees:
 *  - B (anonymization, self-audit B): peer data is only ever returned as an AGGREGATE (mean/median/
 *    quartiles + the tenant's percentile) over a cohort of ≥ MIN_PEER_COHORT opted-in tenants — enforced
 *    both at the cohort level AND per-metric — so no single peer's value or identity can be recovered.
 *  - C (opt-in, self-audit C): only tenants that opted in are ever aggregated, and a tenant can see peer
 *    data only if it too opted in.
 *  - Isolation: the internal view is RLS-scoped (db.withTenant); the peer view uses the admin client but
 *    reads ONLY opted-in tenants and returns ONLY aggregates.
 */

interface WindowInput {
  from?: Date;
  to?: Date;
}

// The five benchmarked metrics for one subject (agent or tenant).
interface CallAggRow {
  key: string;
  calls: number;
  completed: number;
  avgsentiment: number | null;
}
interface CostRow {
  key: string;
  cost: number;
}
interface QaRow {
  key: string;
  qa: number | null;
}
interface RevRow {
  key: string;
  revenuecents: number;
  deals: number;
}

export interface AgentBenchmarkRow {
  agentId: string;
  name: string;
  calls: number;
  metrics: MetricValues;
}

export interface InternalBenchmark {
  from: string;
  to: string;
  agents: AgentBenchmarkRow[];
  /** The best agentId per metric (direction-aware), for highlighting. */
  best: Partial<Record<BenchmarkMetricKey, string>>;
  tenantOverall: MetricValues;
  recommendations: Recommendation[];
}

export interface PeerMetric {
  key: BenchmarkMetricKey;
  self: number | null;
  percentile: number;
  peer: PeerSummary;
}
export type PeerBenchmark =
  | { available: false; reason: 'opt_in_required' | 'insufficient_cohort'; cohortSize: number }
  | {
      available: true;
      industry: Industry;
      cohortSize: number;
      metrics: PeerMetric[];
      recommendations: Recommendation[];
    };

function num(v: unknown): number {
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function isIndustry(v: unknown): v is Industry {
  return typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v);
}

/** Combine the four raw aggregates for one subject into the five benchmark metrics. */
function toMetrics(
  call: CallAggRow | undefined,
  cost: number,
  qa: number | null,
  rev: RevRow | undefined,
): MetricValues {
  const calls = call ? num(call.calls) : 0;
  const completed = call ? num(call.completed) : 0;
  const revenueUsd = rev ? num(rev.revenuecents) / 100 : 0;
  return {
    successRate: calls > 0 ? round((completed / calls) * 100) : null,
    avgSentiment: call && call.avgsentiment !== null ? round(num(call.avgsentiment)) : null,
    costPerCallUsd: calls > 0 ? round(cost / calls) : null,
    qaScore: qa !== null && qa !== undefined ? round(num(qa)) : null,
    roiPercent: cost > 0 ? round(((revenueUsd - cost) / cost) * 100) : null,
  };
}

export class BenchmarkingService {
  constructor(private readonly db: PrismaService) {}

  private window(input: WindowInput): { from: Date; to: Date } {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  // ── settings (opt-in + industry, stored in tenant.settings) ─────────────────────

  async getSettings(tenantId: string): Promise<BenchmarkSettings> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const s = (t?.settings ?? {}) as { benchmarkOptIn?: boolean; benchmarkIndustry?: string };
    return {
      optIn: s.benchmarkOptIn === true,
      industry: isIndustry(s.benchmarkIndustry) ? s.benchmarkIndustry : 'other',
    };
  }

  async updateSettings(tenantId: string, input: unknown): Promise<BenchmarkSettings> {
    const parsed = benchmarkSettingsSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid benchmark settings');
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = {
      ...((t?.settings as object) ?? {}),
      benchmarkOptIn: parsed.data.optIn,
      benchmarkIndustry: parsed.data.industry,
    };
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { settings: settings as object } }),
    );
    return parsed.data;
  }

  // ── internal (per-agent, RLS-scoped) ────────────────────────────────────────────

  async internal(tenantId: string, input: WindowInput = {}): Promise<InternalBenchmark> {
    const { from, to } = this.window(input);
    return this.db.withTenant(tenantId, async (tx) => {
      const callRows = await tx.$queryRaw<CallAggRow[]>`
        SELECT "agentId"::text AS key, count(*)::int AS calls,
               count(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completed,
               avg("sentiment")::float AS avgsentiment
        FROM "Call"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND "agentId" IS NOT NULL
        GROUP BY "agentId"`;
      const costRows = await tx.$queryRaw<CostRow[]>`
        SELECT c."agentId"::text AS key, COALESCE(sum(u."costUsd"),0)::float AS cost
        FROM "UsageRecord" u JOIN "Call" c ON c.id = u."callId"
        WHERE u."ts" >= ${from} AND u."ts" < ${to} AND c."agentId" IS NOT NULL
        GROUP BY c."agentId"`;
      const qaRows = await tx.$queryRaw<QaRow[]>`
        SELECT c."agentId"::text AS key, avg(q."overall")::float AS qa
        FROM "QaScore" q JOIN "Call" c ON c.id = q."callId"
        WHERE q."createdAt" >= ${from} AND q."createdAt" < ${to} AND c."agentId" IS NOT NULL
        GROUP BY c."agentId"`;
      const revRows = await tx.$queryRaw<RevRow[]>`
        SELECT "agentId"::text AS key, COALESCE(sum("amountCents"),0)::bigint AS revenuecents,
               count(*)::int AS deals
        FROM "RevenueEvent"
        WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to} AND "agentId" IS NOT NULL
        GROUP BY "agentId"`;

      const costBy = new Map(costRows.map((r) => [r.key, num(r.cost)]));
      const qaBy = new Map(qaRows.map((r) => [r.key, r.qa === null ? null : num(r.qa)]));
      const revBy = new Map(revRows.map((r) => [r.key, r]));

      const agentIds = callRows.map((r) => r.key);
      const names = agentIds.length
        ? await tx.agent.findMany({
            where: { id: { in: agentIds } },
            select: { id: true, name: true },
          })
        : [];
      const nameOf = new Map(names.map((a) => [a.id, a.name]));

      const agents: AgentBenchmarkRow[] = callRows.map((c) => ({
        agentId: c.key,
        name: nameOf.get(c.key) ?? 'Agent',
        calls: num(c.calls),
        metrics: toMetrics(c, costBy.get(c.key) ?? 0, qaBy.get(c.key) ?? null, revBy.get(c.key)),
      }));

      // Best agent per metric (direction-aware) + the best value achieved, used as the improvement bar.
      const best: Partial<Record<BenchmarkMetricKey, string>> = {};
      const bestValues: MetricValues = {};
      for (const m of BENCHMARK_METRICS) {
        let winner: { id: string; v: number } | null = null;
        for (const a of agents) {
          const v = a.metrics[m.key];
          if (typeof v !== 'number') continue;
          if (!winner || (m.higherIsBetter ? v > winner.v : v < winner.v))
            winner = { id: a.agentId, v };
        }
        if (winner) {
          best[m.key] = winner.id;
          bestValues[m.key] = winner.v;
        }
      }

      const tenantOverall = await this.tenantMetrics(tx, null, from, to);
      const recommendations = recommendationsFrom(tenantOverall, bestValues, 'internal');

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        agents,
        best,
        tenantOverall,
        recommendations,
      };
    });
  }

  /** Tenant-level (or peer-tenant-level) metrics over a window. `tx` may be RLS or admin. */
  private async tenantMetrics(
    // biome-ignore lint/suspicious/noExplicitAny: a Prisma tx or client — both expose $queryRaw
    tx: any,
    tenantFilter: string[] | null,
    from: Date,
    to: Date,
  ): Promise<MetricValues> {
    // For a single subject (null filter = the RLS-scoped tenant), collapse everything to one bucket.
    const rows = await this.perTenant(tx, tenantFilter, from, to);
    const only = rows.get('__all__') ?? rows.values().next().value;
    return only ?? {};
  }

  // ── peer (cross-tenant, admin, opt-in + k-anon gated) ───────────────────────────

  async peers(tenantId: string): Promise<PeerBenchmark> {
    const settings = await this.getSettings(tenantId);
    // C: a tenant sees peers only if it opted in.
    if (!settings.optIn) return { available: false, reason: 'opt_in_required', cohortSize: 0 };

    // The peer window is FIXED server-side (a trailing 30 days), NOT caller-controlled — otherwise a
    // caller could vary the window to move the contributing cohort across the k-anon boundary and
    // difference out a single peer's contribution (self-audit B). Internal (own data) may be windowed.
    const { from, to } = this.window({});

    // Only opted-in tenants in the same industry (excluding self) are ever aggregated (self-audit C).
    const peerTenants = await this.db.admin.tenant.findMany({
      where: {
        AND: [
          { settings: { path: ['benchmarkOptIn'], equals: true } },
          { settings: { path: ['benchmarkIndustry'], equals: settings.industry } },
          { id: { not: tenantId } },
          { status: 'ACTIVE' },
        ],
      },
      select: { id: true },
      take: 1000,
    });
    const peerIds = peerTenants.map((t) => t.id);
    // B: below the k-anonymity threshold, withhold ALL peer data.
    if (!peerCohortSufficient(peerIds.length))
      return { available: false, reason: 'insufficient_cohort', cohortSize: peerIds.length };

    const peerMetricsByTenant = await this.perTenant(this.db.admin, peerIds, from, to);
    const selfMetrics = await this.db.withTenant(tenantId, (tx) =>
      this.tenantMetrics(tx, null, from, to),
    );

    const metrics: PeerMetric[] = [];
    const peerMedians: MetricValues = {};
    for (const m of BENCHMARK_METRICS) {
      const values = [...peerMetricsByTenant.values()]
        .map((mv) => mv[m.key])
        .filter((v): v is number => typeof v === 'number');
      // B (per-metric): only expose a metric with a big-enough contributing cohort.
      if (!peerCohortSufficient(values.length)) continue;
      const summary = summarize(values);
      const self = typeof selfMetrics[m.key] === 'number' ? (selfMetrics[m.key] as number) : null;
      metrics.push({
        key: m.key,
        self,
        percentile: self === null ? 50 : percentileRank(self, values, m.higherIsBetter),
        // Peer view omits min/max — those would be a single peer's exact value (self-audit B).
        peer: toPeerSummary(summary),
      });
      peerMedians[m.key] = summary.median;
    }

    return {
      available: true,
      industry: settings.industry,
      cohortSize: peerIds.length,
      metrics,
      recommendations: recommendationsFrom(selfMetrics, peerMedians, 'peer'),
    };
  }

  /**
   * Per-tenant metrics grouped by tenantId. `tenantFilter` null → the RLS-scoped tenant only (bucketed
   * under '__all__'); an id list → those tenants (admin). Returns a map tenantId → MetricValues; the
   * per-peer values NEVER leave the service (only aggregates are returned to the caller).
   */
  private async perTenant(
    // biome-ignore lint/suspicious/noExplicitAny: a Prisma tx or client — both expose $queryRaw
    tx: any,
    tenantFilter: string[] | null,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValues>> {
    const ids = tenantFilter ?? [];
    const scoped = tenantFilter !== null;
    // Group by tenantId when aggregating peers; a single '__all__' bucket for the RLS-scoped self.
    const callRows: CallAggRow[] = scoped
      ? await tx.$queryRaw`
          SELECT "tenantId"::text AS key, count(*)::int AS calls,
                 count(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completed,
                 avg("sentiment")::float AS avgsentiment
          FROM "Call" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
            AND "tenantId" = ANY(${ids}::uuid[]) GROUP BY "tenantId"`
      : await tx.$queryRaw`
          SELECT '__all__' AS key, count(*)::int AS calls,
                 count(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completed,
                 avg("sentiment")::float AS avgsentiment
          FROM "Call" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}`;
    const costRows: CostRow[] = scoped
      ? await tx.$queryRaw`
          SELECT c."tenantId"::text AS key, COALESCE(sum(u."costUsd"),0)::float AS cost
          FROM "UsageRecord" u JOIN "Call" c ON c.id = u."callId"
          WHERE u."ts" >= ${from} AND u."ts" < ${to} AND c."tenantId" = ANY(${ids}::uuid[])
          GROUP BY c."tenantId"`
      : await tx.$queryRaw`
          SELECT '__all__' AS key, COALESCE(sum(u."costUsd"),0)::float AS cost
          FROM "UsageRecord" u JOIN "Call" c ON c.id = u."callId"
          WHERE u."ts" >= ${from} AND u."ts" < ${to}`;
    const qaRows: QaRow[] = scoped
      ? await tx.$queryRaw`
          SELECT c."tenantId"::text AS key, avg(q."overall")::float AS qa
          FROM "QaScore" q JOIN "Call" c ON c.id = q."callId"
          WHERE q."createdAt" >= ${from} AND q."createdAt" < ${to} AND c."tenantId" = ANY(${ids}::uuid[])
          GROUP BY c."tenantId"`
      : await tx.$queryRaw`
          SELECT '__all__' AS key, avg(q."overall")::float AS qa
          FROM "QaScore" q JOIN "Call" c ON c.id = q."callId"
          WHERE q."createdAt" >= ${from} AND q."createdAt" < ${to}`;
    const revRows: RevRow[] = scoped
      ? await tx.$queryRaw`
          SELECT "tenantId"::text AS key, COALESCE(sum("amountCents"),0)::bigint AS revenuecents,
                 count(*)::int AS deals
          FROM "RevenueEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}
            AND "tenantId" = ANY(${ids}::uuid[]) GROUP BY "tenantId"`
      : await tx.$queryRaw`
          SELECT '__all__' AS key, COALESCE(sum("amountCents"),0)::bigint AS revenuecents,
                 count(*)::int AS deals
          FROM "RevenueEvent" WHERE "occurredAt" >= ${from} AND "occurredAt" < ${to}`;

    const costBy = new Map(costRows.map((r) => [r.key, num(r.cost)]));
    const qaBy = new Map(qaRows.map((r) => [r.key, r.qa === null ? null : num(r.qa)]));
    const revBy = new Map(revRows.map((r) => [r.key, r]));
    const out = new Map<string, MetricValues>();
    for (const c of callRows) {
      out.set(
        c.key,
        toMetrics(c, costBy.get(c.key) ?? 0, qaBy.get(c.key) ?? null, revBy.get(c.key)),
      );
    }
    return out;
  }
}
