-- GME-06: India DLT (TRAI) registration for lawful SMS. Each row is a DLT-approved template
-- (entity/header/template ids + body pattern). A +91 send must match one of these or it is blocked.

CREATE TABLE "DltTemplate" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "entityId"      TEXT NOT NULL,
  "senderId"      TEXT NOT NULL,
  "dltTemplateId" TEXT NOT NULL,
  "category"      TEXT NOT NULL DEFAULT 'transactional',
  "body"          TEXT NOT NULL,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DltTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DltTemplate"
  ADD CONSTRAINT "DltTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DltTemplate_tenantId_idx" ON "DltTemplate" ("tenantId");
CREATE INDEX "DltTemplate_tenantId_active_idx" ON "DltTemplate" ("tenantId", "active");

-- Tenant isolation (Day 04 RLS pattern).
ALTER TABLE "DltTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DltTemplate"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
