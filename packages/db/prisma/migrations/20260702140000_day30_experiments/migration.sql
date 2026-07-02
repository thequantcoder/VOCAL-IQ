-- Day 30: A/B experiments. An Experiment defines variants + a success metric; each Call
-- records which experiment + variant it was routed through so results can be aggregated.

CREATE TABLE "Experiment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metric" TEXT NOT NULL DEFAULT 'conversion',
    "variants" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Experiment_tenantId_idx" ON "Experiment"("tenantId");
CREATE INDEX "Experiment_tenantId_status_idx" ON "Experiment"("tenantId", "status");

ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Variant recording on each Call.
ALTER TABLE "Call" ADD COLUMN "experimentId" UUID;
ALTER TABLE "Call" ADD COLUMN "variant" TEXT;
ALTER TABLE "Call" ADD CONSTRAINT "Call_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Call_experimentId_variant_idx" ON "Call"("experimentId", "variant");

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "Experiment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Experiment"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
