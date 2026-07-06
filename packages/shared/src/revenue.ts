import { z } from 'zod';

/**
 * Revenue attribution + ROI (Day 81) — pure domain shared across api/web.
 *
 * Connects calls to actual closed revenue: a won deal / booking / payment is recorded as a
 * {@link RevenueEvent} carrying the dimensions that drove it (agent, campaign, script, voice, the
 * originating call/lead). The dashboard then answers the question buyers actually care about — ROI,
 * not call counts — by joining revenue against the metered cost of the calls.
 *
 * Two properties matter (self-audit A + D): the ROI math is exact + explicit (profit = revenue −
 * cost; ROI% = profit/cost; margin% = profit/revenue) with the divide-by-zero cases handled, and
 * amounts are integer minor units (cents) so money never drifts through floats. Everything is pure
 * and deterministic, so attribution + ROI unit-test without a DB.
 */

/** Where a revenue figure came from. `payment` = pay-by-voice (Day 78); `crm` = a synced won deal. */
export const REVENUE_SOURCES = ['manual', 'payment', 'crm'] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

/** The dimensions revenue can be attributed to. */
export const ATTRIBUTION_DIMENSIONS = ['agent', 'campaign', 'script', 'voice'] as const;
export type AttributionDimension = (typeof ATTRIBUTION_DIMENSIONS)[number];

const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter code')
  .transform((c) => c.toUpperCase());

/**
 * A closed-revenue event. `amountCents` is integer minor units. The attribution ids are captured at
 * record time (resolved from the call/lead) so the credited dimensions are fixed even if the call is
 * later re-assigned. All dimensions are optional — a manual entry may only know the campaign.
 */
export const revenueEventSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000_00), // ≤ $1M sanity cap
  currency: currencySchema.default('USD'),
  source: z.enum(REVENUE_SOURCES).default('manual'),
  occurredAt: z.coerce.date().optional(),
  callId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  flowVersionId: z.string().uuid().optional(),
  voiceId: z.string().uuid().optional(),
  note: z.string().max(200).optional(),
});
export type RevenueEventInput = z.infer<typeof revenueEventSchema>;

// ── ROI math (pure, exact) ────────────────────────────────────────────────────

/** Convert a float-USD cost (as stored on UsageRecord.costUsd) to integer cents without drift. */
export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

export interface Roi {
  revenueCents: number;
  costCents: number;
  profitCents: number;
  /** profit / cost × 100. null when cost is 0 (ROI undefined / "infinite"). */
  roiPercent: number | null;
  /** profit / revenue × 100. null when revenue is 0. */
  marginPercent: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The ROI of a single revenue/cost pair. Divide-by-zero cases return null (not Infinity/NaN). */
export function roi(revenueCents: number, costCents: number): Roi {
  const profitCents = revenueCents - costCents;
  return {
    revenueCents,
    costCents,
    profitCents,
    roiPercent: costCents > 0 ? round1((profitCents / costCents) * 100) : null,
    marginPercent: revenueCents > 0 ? round1((profitCents / revenueCents) * 100) : null,
  };
}

// ── Attribution aggregation ────────────────────────────────────────────────────

/** A revenue row keyed by an attribution id (e.g. agentId). Rows with a null key are unattributed. */
export interface RevenueRow {
  key: string | null;
  amountCents: number;
}
/** A cost row keyed by the same attribution id, in cents (convert UsageRecord.costUsd first). */
export interface CostRow {
  key: string | null;
  costCents: number;
}

export interface AttributionRow extends Roi {
  key: string;
  deals: number;
}

/**
 * Join revenue + cost by attribution key into per-key ROI rows, sorted by revenue desc. Revenue and
 * cost are summed independently per key (a dimension may have cost but no revenue, and vice-versa),
 * then ROI is computed. Null/empty keys are folded into an `"unattributed"` bucket so no money is
 * silently dropped (self-audit A — every cent is accounted for). Pure + deterministic.
 */
export function attributeRoi(revenue: RevenueRow[], cost: CostRow[]): AttributionRow[] {
  const rev = new Map<string, { amount: number; deals: number }>();
  const cst = new Map<string, number>();
  const bucket = (k: string | null) => k ?? 'unattributed';

  for (const r of revenue) {
    const k = bucket(r.key);
    const cur = rev.get(k) ?? { amount: 0, deals: 0 };
    cur.amount += r.amountCents;
    cur.deals += 1;
    rev.set(k, cur);
  }
  for (const c of cost) {
    const k = bucket(c.key);
    cst.set(k, (cst.get(k) ?? 0) + c.costCents);
  }

  const keys = new Set<string>([...rev.keys(), ...cst.keys()]);
  const rows: AttributionRow[] = [];
  for (const key of keys) {
    const r = rev.get(key) ?? { amount: 0, deals: 0 };
    rows.push({ key, deals: r.deals, ...roi(r.amount, cst.get(key) ?? 0) });
  }
  // Highest revenue first; ties broken by key for determinism.
  rows.sort((a, b) => b.revenueCents - a.revenueCents || a.key.localeCompare(b.key));
  return rows;
}

/** Portfolio totals across all attribution rows (the dashboard header numbers). */
export function totalRoi(rows: AttributionRow[]): Roi & { deals: number } {
  const revenueCents = rows.reduce((s, r) => s + r.revenueCents, 0);
  const costCents = rows.reduce((s, r) => s + r.costCents, 0);
  const deals = rows.reduce((s, r) => s + r.deals, 0);
  return { ...roi(revenueCents, costCents), deals };
}

// ── Conversion funnel ─────────────────────────────────────────────────────────

export interface FunnelStage {
  stage: string;
  count: number;
}
export interface FunnelStep extends FunnelStage {
  /** Conversion from the PREVIOUS stage (null for the first). */
  stepPercent: number | null;
  /** Conversion from the FIRST stage (overall). */
  overallPercent: number | null;
}

/**
 * Turn ordered stage counts (e.g. leads → contacted → won) into step + overall conversion rates.
 * Pure; guards divide-by-zero.
 */
export function funnel(stages: FunnelStage[]): FunnelStep[] {
  const first = stages[0]?.count ?? 0;
  return stages.map((s, i) => {
    if (i === 0) return { ...s, stepPercent: null, overallPercent: null }; // the baseline stage
    const prev = stages[i - 1]?.count ?? 0;
    return {
      ...s,
      stepPercent: prev > 0 ? round1((s.count / prev) * 100) : 0,
      overallPercent: first > 0 ? round1((s.count / first) * 100) : 0,
    };
  });
}
