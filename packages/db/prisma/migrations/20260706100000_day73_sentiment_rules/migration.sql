-- Day 73 — Sentiment-triggered live-action rules + the fired-event log (also the cooldown source).
CREATE TABLE "SentimentRule" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"    UUID NOT NULL,
  "agentId"     UUID,
  "metric"      TEXT NOT NULL,
  "operator"    TEXT NOT NULL,
  "threshold"   DOUBLE PRECISION NOT NULL,
  "action"      TEXT NOT NULL,
  "cooldownSec" INTEGER NOT NULL DEFAULT 30,
  "tag"         TEXT,
  "toneHint"    TEXT,
  "note"        TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SentimentRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SentimentRule_tenantId_active_idx" ON "SentimentRule"("tenantId", "active");
CREATE INDEX "SentimentRule_tenantId_agentId_idx" ON "SentimentRule"("tenantId", "agentId");
ALTER TABLE "SentimentRule" ADD CONSTRAINT "SentimentRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SentimentEvent" (
  "id"       UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "callId"   UUID NOT NULL,
  "ruleId"   UUID NOT NULL,
  "action"   TEXT NOT NULL,
  "metric"   TEXT NOT NULL,
  "value"    DOUBLE PRECISION NOT NULL,
  "ts"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SentimentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SentimentEvent_tenantId_callId_idx" ON "SentimentEvent"("tenantId", "callId");
CREATE INDEX "SentimentEvent_callId_ruleId_ts_idx" ON "SentimentEvent"("callId", "ruleId", "ts");
ALTER TABLE "SentimentEvent" ADD CONSTRAINT "SentimentEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: rules + events are tenant-scoped.
ALTER TABLE "SentimentRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SentimentRule"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "SentimentEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SentimentEvent"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
