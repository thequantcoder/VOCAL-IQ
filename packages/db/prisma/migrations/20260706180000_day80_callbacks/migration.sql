-- Day 80 — Caller-requested callbacks: auto-dialed at the requested time, within legal calling hours
-- evaluated in the caller's timezone. Tenant-scoped via RLS.
CREATE TABLE "Callback" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "agentId"       UUID,
  "contactId"     UUID,
  "callId"        TEXT,
  "phone"         TEXT NOT NULL,
  "requestedAt"   TIMESTAMP(3) NOT NULL,
  "timezone"      TEXT NOT NULL DEFAULT 'UTC',
  "note"          TEXT,
  "status"        TEXT NOT NULL DEFAULT 'scheduled',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastCallId"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Callback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Callback_tenantId_status_idx" ON "Callback"("tenantId", "status");
CREATE INDEX "Callback_status_requestedAt_idx" ON "Callback"("status", "requestedAt");

ALTER TABLE "Callback" ADD CONSTRAINT "Callback_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: callbacks are strictly tenant-scoped.
ALTER TABLE "Callback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Callback"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
