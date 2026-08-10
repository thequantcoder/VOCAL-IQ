-- Day 82 — Outcome-based billing: per-tenant outcome prices + billed outcomes (each billed at most
-- once via the unique key — anti-gaming). Tenant-scoped via RLS.
CREATE TABLE "OutcomePrice" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID NOT NULL,
  "type"       TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "markupBps"  INTEGER NOT NULL DEFAULT 0,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutcomePrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutcomePrice_tenantId_type_key" ON "OutcomePrice"("tenantId", "type");
CREATE INDEX "OutcomePrice_tenantId_idx" ON "OutcomePrice"("tenantId");
ALTER TABLE "OutcomePrice" ADD CONSTRAINT "OutcomePrice_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BillableOutcome" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"            UUID NOT NULL,
  "type"                TEXT NOT NULL,
  "refId"               TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'billed',
  "priceCents"          INTEGER NOT NULL,
  "retailCents"         INTEGER NOT NULL,
  "resellerTenantId"    UUID,
  "resellerMarginCents" INTEGER NOT NULL DEFAULT 0,
  "note"                TEXT,
  "occurredAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillableOutcome_pkey" PRIMARY KEY ("id")
);
-- An outcome (tenant + type + referenced entity) can be billed at most once (self-audit C).
CREATE UNIQUE INDEX "BillableOutcome_tenantId_type_refId_key" ON "BillableOutcome"("tenantId", "type", "refId");
CREATE INDEX "BillableOutcome_tenantId_status_idx" ON "BillableOutcome"("tenantId", "status");
CREATE INDEX "BillableOutcome_tenantId_occurredAt_idx" ON "BillableOutcome"("tenantId", "occurredAt");
ALTER TABLE "BillableOutcome" ADD CONSTRAINT "BillableOutcome_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: both are strictly tenant-scoped.
ALTER TABLE "OutcomePrice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutcomePrice"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "BillableOutcome" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BillableOutcome"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
