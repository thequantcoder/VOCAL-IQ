import { z } from 'zod';

/**
 * Multi-agent analytics benchmarking (Day 86) — the pure domain shared across api/web.
 *
 * Tenants benchmark their agents against (a) their OWN history (internal — which agent is best/worst on
 * each metric) and (b) anonymized, opt-in PEER averages (their industry). Two properties matter most:
 *  - B (anonymization, self-audit B): a peer benchmark is only ever exposed as an AGGREGATE over a
 *    cohort of at least {@link MIN_PEER_COHORT} opted-in tenants ({@link peerCohortSufficient}); a single
 *    peer's raw value or identity is never surfaced — k-anonymity prevents cross-tenant leakage.
 *  - C (opt-in, self-audit C): peer data is computed only over tenants that explicitly opted in, and a
 *    tenant sees peers only if it too opted in (enforced in the service).
 * All maths here — percentile ranking, cohort summary, recommendation generation — is pure +
 * deterministic, so it unit-tests without a DB.
 */

// ── Metrics ─────────────────────────────────────────────────────────────────────

export const BENCHMARK_METRICS = [
  { key: 'successRate', label: 'Success rate', higherIsBetter: true, unit: 'percent' },
  { key: 'avgSentiment', label: 'Avg sentiment', higherIsBetter: true, unit: 'score' },
  { key: 'costPerCallUsd', label: 'Cost / call', higherIsBetter: false, unit: 'usd' },
  { key: 'qaScore', label: 'QA score', higherIsBetter: true, unit: 'score100' },
  { key: 'roiPercent', label: 'ROI', higherIsBetter: true, unit: 'percent' },
] as const;
export type BenchmarkMetricKey = (typeof BENCHMARK_METRICS)[number]['key'];

export function metricMeta(key: BenchmarkMetricKey) {
  const m = BENCHMARK_METRICS.find((x) => x.key === key);
  if (!m) throw new Error(`Unknown benchmark metric: ${key}`);
  return m;
}

/** A set of metric values for one subject (an agent, a tenant, or a peer). Any metric may be null. */
export type MetricValues = Partial<Record<BenchmarkMetricKey, number | null>>;

// ── k-anonymity (self-audit B) ────────────────────────────────────────────────

/**
 * The minimum number of opted-in peer tenants that must contribute before ANY peer aggregate is
 * exposed. Below this, a "mean" could re-identify a single tenant, so we withhold it entirely.
 */
export const MIN_PEER_COHORT = 5;

export function peerCohortSufficient(cohortSize: number): boolean {
  return cohortSize >= MIN_PEER_COHORT;
}

// ── Pure statistics ─────────────────────────────────────────────────────────────

export interface CohortSummary {
  count: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

/**
 * The peer-facing view of a cohort. It deliberately OMITS min/max: with a small cohort those are one
 * individual peer's exact value (the single best/worst competitor), which would leak a single tenant's
 * raw datum. Only central + quartile statistics — which can't be attributed to a known tenant — cross
 * the tenant boundary (self-audit B).
 */
export interface PeerSummary {
  count: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
}

export function toPeerSummary(s: CohortSummary): PeerSummary {
  return { count: s.count, mean: s.mean, median: s.median, p25: s.p25, p75: s.p75 };
}

/** Linear-interpolated quantile of an already-sorted ascending array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] as number;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

/** Summarize a cohort of numeric values (ignores null/NaN). Pure. */
export function summarize(values: Array<number | null | undefined>): CohortSummary {
  const clean = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return { count: 0, mean: 0, median: 0, p25: 0, p75: 0, min: 0, max: 0 };
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    mean: round(sum / sorted.length),
    median: round(quantile(sorted, 0.5)),
    p25: round(quantile(sorted, 0.25)),
    p75: round(quantile(sorted, 0.75)),
    min: round(sorted[0] as number),
    max: round(sorted[sorted.length - 1] as number),
  };
}

/**
 * Where `value` ranks among `peers` as a percentile 0–100 (higher = better standing). For a
 * higher-is-better metric it's the share of peers the value meets or beats; for a lower-is-better metric
 * (e.g. cost) it's inverted so a lower value still ranks high. Pure; 50 if there are no peers.
 */
export function percentileRank(value: number, peers: number[], higherIsBetter: boolean): number {
  if (peers.length === 0) return 50;
  const beaten = peers.filter((p) => (higherIsBetter ? value >= p : value <= p)).length;
  return round((beaten / peers.length) * 100);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Recommendations ──────────────────────────────────────────────────────────────

export interface Recommendation {
  metric: BenchmarkMetricKey;
  label: string;
  message: string;
  /** How far behind the reference the tenant is, in the metric's own units (always ≥ 0). */
  gap: number;
  severity: 'info' | 'warn';
}

/**
 * Turn metric gaps into recommendations. For each metric, compare the tenant's own value against a
 * reference (its best-performing agent for internal, or the peer median for peer). A material shortfall
 * (worse than the reference by more than a small tolerance) yields a recommendation. Pure.
 */
export function recommendationsFrom(
  tenant: MetricValues,
  reference: MetricValues,
  source: 'internal' | 'peer',
): Recommendation[] {
  const out: Recommendation[] = [];
  for (const m of BENCHMARK_METRICS) {
    const tv = tenant[m.key];
    const rv = reference[m.key];
    if (typeof tv !== 'number' || typeof rv !== 'number') continue;
    // "Behind" means worse in the metric's preferred direction.
    const behind = m.higherIsBetter ? rv - tv : tv - rv;
    const tolerance = Math.max(Math.abs(rv) * 0.05, 0.001); // 5% (or a floor) — ignore noise
    if (behind <= tolerance) continue;
    const where = source === 'internal' ? 'your best agent' : 'the peer median';
    out.push({
      metric: m.key,
      label: m.label,
      message: `${m.label} trails ${where} by ${round(behind)}${unitSuffix(m.unit)} — a chance to improve.`,
      gap: round(behind),
      severity: behind > tolerance * 3 ? 'warn' : 'info',
    });
  }
  return out;
}

function unitSuffix(unit: string): string {
  if (unit === 'percent') return '%';
  if (unit === 'usd') return ' USD';
  return '';
}

// ── Settings (opt-in + industry) ─────────────────────────────────────────────────

export const INDUSTRIES = [
  'other',
  'financial_services',
  'insurance',
  'healthcare',
  'real_estate',
  'retail',
  'technology',
  'education',
  'hospitality',
  'automotive',
  'legal',
  'home_services',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const benchmarkSettingsSchema = z.object({
  /** Opt in to contribute anonymized aggregates AND to see peer benchmarks (both require opt-in). */
  optIn: z.boolean(),
  industry: z.enum(INDUSTRIES).default('other'),
});
export type BenchmarkSettings = z.infer<typeof benchmarkSettingsSchema>;
