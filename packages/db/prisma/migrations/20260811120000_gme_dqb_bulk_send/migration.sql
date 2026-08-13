-- GME-DQ-b: durable bulk message send. A MessageBulkJob holds the send spec; its recipients are
-- persisted (one row each, PENDING) and drained async by the bulk-send worker through the guard.

CREATE TABLE "MessageBulkJob" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID NOT NULL,
  "channel"           TEXT NOT NULL,
  "templateId"        UUID,
  "body"              TEXT,
  "variables"         JSONB NOT NULL DEFAULT '{}',
  "requireConsent"    BOOLEAN NOT NULL DEFAULT true,
  "respectQuietHours" BOOLEAN NOT NULL DEFAULT true,
  "status"            TEXT NOT NULL DEFAULT 'RUNNING',
  "total"             INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageBulkJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageBulkJob_tenantId_idx" ON "MessageBulkJob" ("tenantId");
CREATE INDEX "MessageBulkJob_status_idx" ON "MessageBulkJob" ("status");

CREATE TABLE "MessageBulkRecipient" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "jobId"     UUID NOT NULL,
  "toAddr"    TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'PENDING',
  "reason"    TEXT,
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageBulkRecipient_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MessageBulkRecipient"
  ADD CONSTRAINT "MessageBulkRecipient_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "MessageBulkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MessageBulkRecipient_tenantId_idx" ON "MessageBulkRecipient" ("tenantId");
CREATE INDEX "MessageBulkRecipient_jobId_idx" ON "MessageBulkRecipient" ("jobId");
CREATE INDEX "MessageBulkRecipient_jobId_status_idx" ON "MessageBulkRecipient" ("jobId", "status");

-- Tenant isolation (Day 04 RLS pattern).
ALTER TABLE "MessageBulkJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessageBulkJob"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "MessageBulkRecipient" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessageBulkRecipient"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
