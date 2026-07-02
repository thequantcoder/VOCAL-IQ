import { z } from 'zod';

/**
 * A/B experiment pure logic (Day 30): deterministic traffic splitting, success-metric
 * evaluation, per-variant aggregation, and a two-proportion significance test. Kept pure
 * so assignment stability + the stats (self-audit A) are fully unit-tested. The API routes
 * calls through `assignVariant`, records the variant on the Call, then aggregates results.
 */

// ── Config ──────────────────────────────────────────────────────────────────────

export const experimentVariantSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  weight: z.number().int().min(1).max(1000).default(1), // relative traffic weight
  config: z.record(z.string(), z.unknown()).default({}), // script/voice/opener overrides
});
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;

export const EXPERIMENT_METRICS = ['conversion', 'booking', 'csat'] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

export const experimentConfigSchema = z
  .object({
    metric: z.enum(EXPERIMENT_METRICS).default('conversion'),
    variants: z.array(experimentVariantSchema).min(2).max(10),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    for (const [i, v] of cfg.variants.entries()) {
      if (ids.has(v.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'id'],
          message: `Duplicate variant id "${v.id}"`,
        });
      }
      ids.add(v.id);
    }
  });
export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;

// ── Deterministic split ──────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — small, dependency-free, good enough for stable bucketing. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // unsigned
}

/**
 * Assign a stable variant for `key` (e.g. contactId or callId) honouring the variants'
 * relative weights. The SAME key always maps to the SAME variant (so a contact keeps its
 * variant across retries) while the population splits by weight. Returns null if no
 * variants. Self-audit A: deterministic + weight-proportional.
 */
export function assignVariant(variants: ExperimentVariant[], key: string): string | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return variants[0]?.id ?? null;
  const bucket = hashKey(key) % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (bucket < acc) return v.id;
  }
  return variants[variants.length - 1]?.id ?? null;
}

// ── Success metric ────────────────────────────────────────────────────────────────

export interface CallOutcome {
  variant: string | null;
  disposition: string | null;
  sentiment: number | null; // -1..1 (CSAT proxy)
}

/** Whether a call counts as a success for the experiment's metric. */
export function evaluateMetric(metric: ExperimentMetric, call: CallOutcome): boolean {
  const disp = (call.disposition ?? '').toUpperCase();
  switch (metric) {
    case 'booking':
      return disp === 'BOOKED';
    case 'csat':
      return (call.sentiment ?? 0) >= 0.3; // positive sentiment
    default: // conversion
      return disp === 'BOOKED' || disp === 'COMPLETED' || disp === 'CONVERTED';
  }
}

// ── Aggregation ────────────────────────────────────────────────────────────────────

export interface VariantResult {
  variant: string;
  total: number;
  conversions: number;
  rate: number; // 0..1
}

/** Per-variant totals + conversion rate for the metric. Calls with no variant are ignored. */
export function aggregateResults(metric: ExperimentMetric, calls: CallOutcome[]): VariantResult[] {
  const map = new Map<string, { total: number; conversions: number }>();
  for (const c of calls) {
    if (!c.variant) continue;
    const agg = map.get(c.variant) ?? { total: 0, conversions: 0 };
    agg.total++;
    if (evaluateMetric(metric, c)) agg.conversions++;
    map.set(c.variant, agg);
  }
  return [...map.entries()].map(([variant, a]) => ({
    variant,
    total: a.total,
    conversions: a.conversions,
    rate: a.total > 0 ? a.conversions / a.total : 0,
  }));
}

// ── Significance (two-proportion z-test) ─────────────────────────────────────────

/** Standard normal CDF via an Abramowitz–Stegun erf approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export interface SignificanceResult {
  z: number;
  pValue: number; // two-tailed
  significant: boolean; // p < 0.05
  lift: number; // (rateB - rateA) / rateA
}

/**
 * Two-proportion z-test comparing variant B against control A. Returns the z-score,
 * two-tailed p-value, a 95% significance flag, and the relative lift. Guards the
 * zero-sample / zero-variance cases so it never returns NaN.
 */
export function twoProportionTest(
  aConversions: number,
  aTotal: number,
  bConversions: number,
  bTotal: number,
): SignificanceResult {
  if (aTotal === 0 || bTotal === 0) {
    return { z: 0, pValue: 1, significant: false, lift: 0 };
  }
  const pA = aConversions / aTotal;
  const pB = bConversions / bTotal;
  const pPool = (aConversions + bConversions) / (aTotal + bTotal);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / aTotal + 1 / bTotal));
  const z = se === 0 ? 0 : (pB - pA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const lift = pA === 0 ? 0 : (pB - pA) / pA;
  return { z, pValue, significant: pValue < 0.05, lift };
}
