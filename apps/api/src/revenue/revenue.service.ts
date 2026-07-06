import {
  type AttributionRow,
  type CostRow,
  type FunnelStep,
  type RevenueRow,
  type Roi,
  ValidationError,
  attributeRoi,
  funnel,
  revenueEventSchema,
  totalRoi,
  usdToCents,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Revenue attribution (Day 81). Records closed-revenue events and answers the question buyers care
 * about — ROI, not call counts — by attributing revenue to the agent/campaign/source that drove it
 * and joining it against the metered cost of the calls. The ROI + attribution MATH is the pure,
 * unit-tested `@vocaliq/shared` (`roi`, `attributeRoi`, `funnel`); this service only does the
 * RLS-scoped reads/writes + shapes the dashboard (self-audit B — every query is `withTenant`).
 */

export interface RevenueDashboard {
  from: string;
  to: string;
  totals: Roi & { deals: number };
  byAgent: AttributionRow[];
  byCampaign: AttributionRow[]; // revenue attribution (campaign cost isn't call-linked — ROI columns n/a)
  bySource: { source: string; revenueCents: number; deals: number }[];
  funnel: FunnelStep[];
  /** True when the revenue-event window exceeded the query cap and figures are a lower bound. */
  truncated: boolean;
}

/** Max revenue events aggregated per dashboard window (bounded for perf; `truncated` flags overflow). */
const EVENT_CAP = 20_000;

const EVENT_SELECT = {
  id: true,
  amountCents: true,
  currency: true,
  source: true,
  occurredAt: true,
  callId: true,
  agentId: true,
  campaignId: true,
  note: true,
} as const;

export class RevenueService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Record a closed-revenue event. When a `callId` is given but no `agentId`, the agent is resolved
   * from the call (RLS-scoped) so revenue is auto-attributed. Amounts are integer cents.
   */
  async record(tenantId: string, input: unknown) {
    const parsed = revenueEventSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid revenue event');
    const d = parsed.data;

    return this.db.withTenant(tenantId, async (tx) => {
      let agentId = d.agentId ?? null;
      let campaignId = d.campaignId ?? null;
      if (d.callId && (!agentId || !campaignId)) {
        const call = await tx.call.findFirst({
          where: { id: d.callId },
          select: { agentId: true, contactId: true },
        });
        if (call) {
          agentId = agentId ?? call.agentId;
          // Best-effort campaign attribution: the call's contact in a campaign.
          if (!campaignId && call.contactId) {
            const cc = await tx.campaignContact.findFirst({
              where: { contactId: call.contactId },
              select: { campaignId: true },
              orderBy: { id: 'asc' },
            });
            campaignId = cc?.campaignId ?? null;
          }
        }
      }
      return tx.revenueEvent.create({
        data: {
          tenantId,
          amountCents: d.amountCents,
          currency: d.currency,
          source: d.source,
          ...(d.occurredAt ? { occurredAt: d.occurredAt } : {}),
          ...(d.callId ? { callId: d.callId } : {}),
          ...(d.leadId ? { leadId: d.leadId } : {}),
          ...(agentId ? { agentId } : {}),
          ...(campaignId ? { campaignId } : {}),
          ...(d.flowVersionId ? { flowVersionId: d.flowVersionId } : {}),
          ...(d.voiceId ? { voiceId: d.voiceId } : {}),
          ...(d.note ? { note: d.note } : {}),
        },
        select: EVENT_SELECT,
      });
    });
  }

  /** Recent revenue events (RLS-scoped), newest first. */
  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.revenueEvent.findMany({
        orderBy: { occurredAt: 'desc' },
        take: 200,
        select: EVENT_SELECT,
      }),
    );
  }

  /**
   * The revenue dashboard for a window: portfolio ROI, per-agent ROI (revenue ⋈ metered cost by
   * agent), per-campaign revenue, revenue by source, and the leads→calls→deals funnel. Revenue is
   * aggregated from the raw events (so deal counts are exact); cost comes from a `UsageRecord ⋈ Call`
   * rollup. All reads are RLS-scoped.
   */
  async dashboard(tenantId: string, range: { from: Date; to: Date }): Promise<RevenueDashboard> {
    const { from, to } = range;
    return this.db.withTenant(tenantId, async (tx) => {
      // Revenue events in the window, keyed by close time (`occurredAt`). Deals are rare, so fetching
      // them lets the pure aggregator count deals exactly. Fetch one past the cap to detect overflow
      // (no silent truncation — `truncated` flags it).
      const fetched = await tx.revenueEvent.findMany({
        where: { occurredAt: { gte: from, lt: to } },
        select: { amountCents: true, agentId: true, campaignId: true, source: true },
        take: EVENT_CAP + 1,
      });
      const truncated = fetched.length > EVENT_CAP;
      const events = truncated ? fetched.slice(0, EVENT_CAP) : fetched;

      // Metered provider cost per agent (UsageRecord ⋈ Call), keyed by usage time (`ts`). A LEFT JOIN
      // keeps costs whose call is null/missing under a null agent → the aggregator folds them into
      // `unattributed`, so every cent is accounted for and `sum(byAgent) === totals`. Cost is the raw
      // metered provider cost (BYOK included — it's a real cost of producing the revenue). RLS-scoped.
      const costRows = await tx.$queryRaw<{ key: string | null; costusd: number }[]>`
        SELECT c."agentId"::text AS key, COALESCE(sum(u."costUsd"), 0)::float AS costusd
        FROM "UsageRecord" u LEFT JOIN "Call" c ON c.id = u."callId"
        WHERE u."ts" >= ${from} AND u."ts" < ${to}
        GROUP BY c."agentId"`;

      const revByAgent: RevenueRow[] = events.map((e) => ({
        key: e.agentId,
        amountCents: e.amountCents,
      }));
      const costByAgent: CostRow[] = costRows.map((r) => ({
        key: r.key,
        costCents: usdToCents(r.costusd),
      }));
      const byAgent = attributeRoi(revByAgent, costByAgent);
      // Derive portfolio totals FROM the per-agent rows so they always equal their sum (consistent
      // rounding + query semantics — self-audit A). `totalRoi` also returns the exact deal count.
      const totals = totalRoi(byAgent);

      const byCampaign = attributeRoi(
        events.map((e) => ({ key: e.campaignId, amountCents: e.amountCents })),
        [],
      );

      // Revenue by source (in-memory reduce over the events).
      const sourceMap = new Map<string, { revenueCents: number; deals: number }>();
      for (const e of events) {
        const cur = sourceMap.get(e.source) ?? { revenueCents: 0, deals: 0 };
        cur.revenueCents += e.amountCents;
        cur.deals += 1;
        sourceMap.set(e.source, cur);
      }
      const bySource = [...sourceMap.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.revenueCents - a.revenueCents);

      // Funnel counts use `createdAt` (when leads/calls were initiated) — a different time dimension
      // from revenue's close time, so a lead created in-window may close outside it. This is the
      // initiation-period funnel, not a strict cohort.
      const [leads, calls] = await Promise.all([
        tx.lead.count({ where: { createdAt: { gte: from, lt: to } } }),
        tx.call.count({ where: { createdAt: { gte: from, lt: to } } }),
      ]);
      const funnelSteps = funnel([
        { stage: 'leads', count: leads },
        { stage: 'calls', count: calls },
        { stage: 'deals', count: events.length },
      ]);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        totals,
        byAgent,
        byCampaign,
        bySource,
        funnel: funnelSteps,
        truncated,
      };
    });
  }
}
