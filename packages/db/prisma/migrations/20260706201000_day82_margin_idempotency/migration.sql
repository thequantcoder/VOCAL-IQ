-- Day 82 (review fix) — make reseller-margin accrual idempotent (upsert-able) and let a disputed
-- outcome reverse the exact margin it accrued.
-- One margin row per (reseller, child, period) so accrueMargin can UPSERT (no create-race).
CREATE UNIQUE INDEX "ResellerMargin_resellerTenantId_childTenantId_period_key"
  ON "ResellerMargin"("resellerTenantId", "childTenantId", "period");

-- Remember the accrual period on the billed outcome so a dispute reverses the reseller margin exactly.
ALTER TABLE "BillableOutcome" ADD COLUMN "period" TEXT;
