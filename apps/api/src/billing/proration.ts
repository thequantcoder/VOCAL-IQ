/**
 * Proration + metered-overage math (self-audit focus D — usage→billing accuracy). Pure
 * functions in integer minor units (cents) to avoid float drift; the Stripe push happens
 * behind the BillingProcessor seam.
 */

/**
 * Credit/charge when switching plans mid-cycle: the unused portion of the old plan is
 * credited and the remaining portion of the new plan is charged, pro-rated by the days
 * left in the current period. Positive = charge the customer, negative = credit.
 */
export function prorationCents(params: {
  oldMonthlyCents: number;
  newMonthlyCents: number;
  daysRemaining: number;
  daysInPeriod: number;
}): number {
  const { oldMonthlyCents, newMonthlyCents, daysRemaining, daysInPeriod } = params;
  if (daysInPeriod <= 0) return 0;
  const frac = Math.max(0, Math.min(1, daysRemaining / daysInPeriod));
  const credit = Math.round(oldMonthlyCents * frac);
  const charge = Math.round(newMonthlyCents * frac);
  return charge - credit;
}

/** Billable overage from metered minutes beyond the plan's included minutes. */
export function overageCents(params: {
  usedMinutes: number;
  includedMinutes: number;
  overageRatePerMinCents: number;
}): number {
  const overage = Math.max(0, params.usedMinutes - params.includedMinutes);
  return overage * params.overageRatePerMinCents;
}
