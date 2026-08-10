-- Day 75 — Conversation intelligence: per-call mined signals + per-tenant config.
CREATE TABLE "CallSignal" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "callId"    UUID NOT NULL,
  "type"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "quote"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallSignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CallSignal_tenantId_type_createdAt_idx" ON "CallSignal"("tenantId", "type", "createdAt");
CREATE INDEX "CallSignal_tenantId_callId_idx" ON "CallSignal"("tenantId", "callId");
CREATE INDEX "CallSignal_tenantId_label_idx" ON "CallSignal"("tenantId", "label");
ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConversationIntelConfig" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"    UUID NOT NULL,
  "competitors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "alertRules"  JSONB NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationIntelConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConversationIntelConfig_tenantId_key" ON "ConversationIntelConfig"("tenantId");
ALTER TABLE "ConversationIntelConfig" ADD CONSTRAINT "ConversationIntelConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: both are tenant-scoped.
ALTER TABLE "CallSignal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CallSignal"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "ConversationIntelConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConversationIntelConfig"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
