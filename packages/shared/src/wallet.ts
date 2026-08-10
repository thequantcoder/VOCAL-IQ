/**
 * Reseller money engine (Day 53) — the pure, money-critical core. EVERYTHING is integer minor
 * units (cents); we round only at display. This module computes the pricing chain (platform cost
 * → wholesale → reseller retail → end-customer charge), the per-minute charge (partial minutes),
 * the wallet balance from an append-only ledger (idempotent by key), the negative-balance guard,
 * and period reconciliation (revenue − cost = margin). No floats, no I/O — so the maths is
 * exhaustively unit-tested and can never silently drift (self-audit D — the critical property).
 */

// ── Pricing chain (per metered unit) ────────────────────────────────────────

export interface PricingInput {
  /** What the platform paid a provider (from UsageRecord), in cents. */
  platformCostCents: number;
  /** What the platform charges the reseller (super-admin set), in cents. */
  wholesaleCents: number;
  /** Reseller's markup over wholesale, in basis points (100 bps = 1%). */
  retailMarkupBps: number;
}

export interface PricingChain {
  platformCostCents: number;
  wholesaleCents: number;
  retailCents: number; // what the end customer is charged
  /** reseller keeps retail − wholesale. */
  resellerMarginCents: number;
  /** platform keeps wholesale − cost. */
  platformRevenueCents: number;
}

const toCents = (n: number) => Math.round(n);

/** Apply a basis-points markup to a base amount (integer cents; rounds half-up). */
export function applyMarkupBps(baseCents: number, bps: number): number {
  return toCents(baseCents + (baseCents * bps) / 10_000);
}

/**
 * Compute the full pricing chain for one metered unit. `retail = wholesale + markup`; the
 * reseller keeps `retail − wholesale`, the platform keeps `wholesale − cost`. All integer cents.
 */
export function computePricingChain(input: PricingInput): PricingChain {
  const platformCostCents = toCents(input.platformCostCents);
  const wholesaleCents = toCents(input.wholesaleCents);
  const retailCents = applyMarkupBps(wholesaleCents, input.retailMarkupBps);
  return {
    platformCostCents,
    wholesaleCents,
    retailCents,
    resellerMarginCents: retailCents - wholesaleCents,
    platformRevenueCents: wholesaleCents - platformCostCents,
  };
}

/**
 * Cents to bill for a call of `durationSec` at `ratePerMinCents`. Partial minutes: `ceil` rounds
 * up to the next whole minute (telecom-standard); `per_second` bills the exact fraction.
 */
export function minuteChargeCents(
  durationSec: number,
  ratePerMinCents: number,
  rounding: 'ceil' | 'per_second' = 'ceil',
): number {
  if (durationSec <= 0 || ratePerMinCents <= 0) return 0;
  if (rounding === 'ceil') return Math.ceil(durationSec / 60) * ratePerMinCents;
  return toCents((durationSec / 60) * ratePerMinCents);
}

// ── Append-only wallet ledger ────────────────────────────────────────────────

export interface LedgerEntry {
  /** Stable idempotency key — replaying the same key must NOT double-post. */
  key: string;
  /** Positive = credit (top-up/refund); negative = debit (usage charge). */
  amountCents: number;
  currency: string;
}

/** Dedupe ledger entries by idempotency key (first occurrence wins) — the append-only invariant. */
export function dedupeLedger<T extends LedgerEntry>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of entries) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    out.push(e);
  }
  return out;
}

/** Balance = sum of the (deduped) ledger entries, in cents. */
export function ledgerBalance(entries: LedgerEntry[]): number {
  return dedupeLedger(entries).reduce((sum, e) => sum + toCents(e.amountCents), 0);
}

/**
 * Can `balanceCents` absorb a debit of `amountCents` given a `graceCents` overdraft allowance?
 * Prevents driving a wallet below the grace floor (hard stop when exhausted).
 */
export function canDebit(balanceCents: number, amountCents: number, graceCents = 0): boolean {
  return balanceCents - Math.abs(toCents(amountCents)) >= -Math.abs(graceCents);
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export interface MarginRow {
  revenueCents: number; // what the reseller charged its customer (retail)
  costCents: number; // what the reseller paid the platform (wholesale)
}

export interface PeriodMargin {
  revenueCents: number;
  costCents: number;
  marginCents: number;
}

/** Sum a period's rows into revenue/cost/margin (margin = revenue − cost). Ties out to the penny. */
export function reconcilePeriod(rows: MarginRow[]): PeriodMargin {
  const revenueCents = rows.reduce((s, r) => s + toCents(r.revenueCents), 0);
  const costCents = rows.reduce((s, r) => s + toCents(r.costCents), 0);
  return { revenueCents, costCents, marginCents: revenueCents - costCents };
}

/** Currency guard: mixing currencies on one wallet is a bug — reject it loudly (self-audit D). */
export function assertSameCurrency(a: string, b: string): void {
  if (a.toUpperCase() !== b.toUpperCase()) {
    throw new Error(`Currency mismatch: ${a} vs ${b}`);
  }
}
