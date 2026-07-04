-- Day 60 — Compliance: consent capture + DNC suppression.
CREATE TABLE "ConsentRecord" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "region"       TEXT NOT NULL,
  "channel"      TEXT NOT NULL DEFAULT 'voice',
  "granted"      BOOLEAN NOT NULL,
  "basis"        TEXT,
  "ts"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsentRecord_tenantId_contactPhone_idx" ON "ConsentRecord"("tenantId", "contactPhone");
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Suppression" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID,
  "phone"     TEXT NOT NULL,
  "reason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Suppression_tenantId_phone_key" ON "Suppression"("tenantId", "phone");
CREATE INDEX "Suppression_phone_idx" ON "Suppression"("phone");
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: consent is tenant-scoped; suppression allows NULL-tenant global rows visible to all.
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentRecord"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "Suppression" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Suppression"
  USING ("tenantId" IS NULL OR is_in_subtree("tenantId", current_tenant()))
  WITH CHECK ("tenantId" IS NULL OR is_in_subtree("tenantId", current_tenant()));
