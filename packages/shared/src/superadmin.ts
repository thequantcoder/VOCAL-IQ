import { z } from 'zod';

/**
 * Super-admin console (Day 55) — pure aggregation + validation for the platform owner's control
 * plane. Everything data-crossing (spanning tenants) lives behind a SUPER_ADMIN gate at the API
 * layer; here we keep only the pure roll-ups + schemas so they're unit-testable in isolation and
 * shared with the web dashboard. Money is integer minor units (cents) — never floats.
 */

/** Tenant search / filter (paginated). */
export const tenantSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  type: z.enum(['PLATFORM', 'RESELLER', 'CUSTOMER']).optional(),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export type TenantSearch = z.infer<typeof tenantSearchSchema>;

/** Impersonation request — a reason is REQUIRED so every grant is accountable (self-audit C). */
export const impersonateInputSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});
export type ImpersonateInput = z.infer<typeof impersonateInputSchema>;

/** One reseller/customer's period money, keyed for the platform roll-up. */
export interface PlatformMarginRow {
  resellerTenantId: string;
  revenueCents: number;
  costCents: number;
}

export interface PlatformTenantCounts {
  total: number;
  resellers: number;
  customers: number;
  active: number;
  suspended: number;
  trial: number;
}

export interface PlatformOverview {
  period: string;
  /** Retail revenue billed to customers this period (what resellers charge). */
  grossRevenueCents: number;
  /** Underlying provider cost the platform pays. */
  providerCostCents: number;
  /** Platform + reseller margin combined (gross − cost). */
  totalMarginCents: number;
  marginRate: number;
  tenants: PlatformTenantCounts;
}

/**
 * Roll up the whole platform's money for a period from the reseller-margin rows plus the tenant
 * census. `marginRate` guards against divide-by-zero on an empty period. Ties out to the same
 * `ResellerMargin` rows the Day-53 wallet engine writes (self-audit D).
 */
export function aggregatePlatformOverview(
  period: string,
  rows: PlatformMarginRow[],
  counts: PlatformTenantCounts,
): PlatformOverview {
  let grossRevenueCents = 0;
  let providerCostCents = 0;
  for (const r of rows) {
    grossRevenueCents += r.revenueCents;
    providerCostCents += r.costCents;
  }
  const totalMarginCents = grossRevenueCents - providerCostCents;
  return {
    period,
    grossRevenueCents,
    providerCostCents,
    totalMarginCents,
    marginRate: grossRevenueCents === 0 ? 0 : totalMarginCents / grossRevenueCents,
    tenants: counts,
  };
}

// ── System health ────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthSignals {
  /** Can the platform reach Postgres? A false here is always `down`. */
  dbOk: boolean;
  /** Combined queue backlog across workers (BullMQ waiting+delayed). */
  queueDepth: number;
  /** Fraction of recent operations that errored (0–1). */
  errorRate: number;
}

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  detail: string;
}

/** Thresholds — a single source of truth so the API + tests agree. */
export const HEALTH_THRESHOLDS = {
  queueDepthDegraded: 100,
  queueDepthDown: 1000,
  errorRateDegraded: 0.05,
  errorRateDown: 0.25,
} as const;

/**
 * Derive an overall traffic-light from raw signals. DB unreachable ⇒ `down` (nothing else
 * matters); otherwise the WORST of the queue-depth and error-rate bands wins. Pure + fully
 * covered by unit tests so the operator never sees a green light over a red system.
 */
export function deriveHealthStatus(signals: HealthSignals): HealthStatus {
  if (!signals.dbOk) return 'down';
  const bands: HealthStatus[] = [
    band(
      signals.queueDepth,
      HEALTH_THRESHOLDS.queueDepthDegraded,
      HEALTH_THRESHOLDS.queueDepthDown,
    ),
    band(signals.errorRate, HEALTH_THRESHOLDS.errorRateDegraded, HEALTH_THRESHOLDS.errorRateDown),
  ];
  if (bands.includes('down')) return 'down';
  if (bands.includes('degraded')) return 'degraded';
  return 'ok';
}

function band(value: number, degradedAt: number, downAt: number): HealthStatus {
  if (value >= downAt) return 'down';
  if (value >= degradedAt) return 'degraded';
  return 'ok';
}
