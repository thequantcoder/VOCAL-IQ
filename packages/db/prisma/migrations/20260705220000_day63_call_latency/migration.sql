-- Day 63 — Per-turn voice-loop latency samples for the dashboard + SLO enforcement.
CREATE TABLE "CallLatency" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "callId"    UUID,
  "sttMs"     INTEGER NOT NULL,
  "llmTtftMs" INTEGER NOT NULL,
  "ttsTtfaMs" INTEGER NOT NULL,
  "networkMs" INTEGER NOT NULL,
  "totalMs"   INTEGER NOT NULL,
  "provider"  TEXT,
  "region"    TEXT,
  "ts"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallLatency_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CallLatency_tenantId_ts_idx" ON "CallLatency"("tenantId", "ts");
ALTER TABLE "CallLatency" ADD CONSTRAINT "CallLatency_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallLatency" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CallLatency"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
