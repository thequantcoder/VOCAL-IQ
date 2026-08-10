-- Day 81 — Revenue attribution: closed-revenue events attributed to agent/campaign/script/voice +
-- the originating call/lead. ROI = revenue vs the metered cost of the calls. Tenant-scoped via RLS.
CREATE TABLE "RevenueEvent" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "amountCents"   INTEGER NOT NULL,
  "currency"      TEXT NOT NULL DEFAULT 'USD',
  "source"        TEXT NOT NULL DEFAULT 'manual',
  "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "callId"        UUID,
  "leadId"        UUID,
  "agentId"       UUID,
  "campaignId"    UUID,
  "flowVersionId" UUID,
  "voiceId"       UUID,
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RevenueEvent_tenantId_occurredAt_idx" ON "RevenueEvent"("tenantId", "occurredAt");
CREATE INDEX "RevenueEvent_tenantId_agentId_idx" ON "RevenueEvent"("tenantId", "agentId");
CREATE INDEX "RevenueEvent_tenantId_campaignId_idx" ON "RevenueEvent"("tenantId", "campaignId");

ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: revenue is strictly tenant-scoped.
ALTER TABLE "RevenueEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RevenueEvent"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
