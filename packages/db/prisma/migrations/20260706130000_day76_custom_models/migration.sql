-- Day 76 — Per-tenant custom/fine-tuned LLM profiles (consent-recorded, tenant-isolated).
CREATE TABLE "CustomModel" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL,
  "name"         TEXT NOT NULL,
  "provider"     "Provider" NOT NULL,
  "baseModel"    TEXT NOT NULL,
  "fineTuneId"   TEXT,
  "systemPrompt" TEXT,
  "status"       TEXT NOT NULL DEFAULT 'ready',
  "consentBy"    TEXT NOT NULL,
  "consentText"  TEXT NOT NULL,
  "consentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomModel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomModel_tenantId_active_idx" ON "CustomModel"("tenantId", "active");
ALTER TABLE "CustomModel" ADD CONSTRAINT "CustomModel_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bind an agent to a custom model (nullable — most agents use the routed default).
ALTER TABLE "Agent" ADD COLUMN "customModelId" UUID;

-- RLS: custom models are strictly tenant-scoped — never shared across tenants (self-audit B).
ALTER TABLE "CustomModel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomModel"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
