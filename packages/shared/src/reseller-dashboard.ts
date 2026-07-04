import { z } from 'zod';

/**
 * Reseller portal dashboards (Day 54) — the pure aggregation core. Rolls a reseller's period
 * `ResellerMargin` rows (one per child per period, from the Day-53 engine) into the portal
 * totals + a top-clients ranking. Integer minor units (cents) throughout so the numbers TIE
 * OUT exactly to the money engine (self-audit D); the api supplies the RLS-scoped rows.
 */

/** Reseller markup config (basis points; 100 bps = 1%). Drives the Day-53 pricing chain. */
export const markupConfigSchema = z.object({
  markupBps: z.number().int().min(0).max(100_000), // ≤ 1000%
});
export type MarkupConfig = z.infer<typeof markupConfigSchema>;

export interface ClientMarginRow {
  childTenantId: string;
  name?: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

export interface ResellerOverview {
  period: string;
  totalRevenueCents: number;
  totalCostCents: number;
  totalMarginCents: number;
  clientCount: number;
  /** Margin as a fraction of revenue (0..1); 0 when no revenue. */
  marginRate: number;
  /** Clients ranked by revenue (highest first). */
  topClients: ClientMarginRow[];
}

/**
 * Aggregate a reseller's per-client margin rows into the portal overview. `margin = revenue −
 * cost` per client and in total; `marginRate = margin / revenue`. Clients are ranked by revenue.
 */
export function aggregateResellerOverview(
  period: string,
  rows: ClientMarginRow[],
  topN = 10,
): ResellerOverview {
  const totalRevenueCents = rows.reduce((s, r) => s + r.revenueCents, 0);
  const totalCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const totalMarginCents = totalRevenueCents - totalCostCents;
  const topClients = [...rows]
    .map((r) => ({ ...r, marginCents: r.revenueCents - r.costCents }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, topN);
  return {
    period,
    totalRevenueCents,
    totalCostCents,
    totalMarginCents,
    clientCount: rows.length,
    marginRate: totalRevenueCents > 0 ? totalMarginCents / totalRevenueCents : 0,
    topClients,
  };
}
