-- WhatsApp Business Calling cost metering (WAC-06): per-call carrier cost columns on WhatsAppCall
-- (idempotent by billedAt) + a monthly outbound-volume accrual table for the pricing-tier selection.

ALTER TABLE "WhatsAppCall" ADD COLUMN "costUsd" DOUBLE PRECISION;
ALTER TABLE "WhatsAppCall" ADD COLUMN "billedCountry" TEXT;
ALTER TABLE "WhatsAppCall" ADD COLUMN "billedAt" TIMESTAMP(3);

CREATE TABLE "WhatsAppCallVolume" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "period"        TEXT NOT NULL,
  "billedSeconds" INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCallVolume_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppCallVolume_tenantId_period_key" ON "WhatsAppCallVolume"("tenantId", "period");
CREATE INDEX "WhatsAppCallVolume_tenantId_idx" ON "WhatsAppCallVolume"("tenantId");
ALTER TABLE "WhatsAppCallVolume" ADD CONSTRAINT "WhatsAppCallVolume_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: monthly volume is tenant-scoped (same policy shape as every tenant table).
ALTER TABLE "WhatsAppCallVolume" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppCallVolume"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
