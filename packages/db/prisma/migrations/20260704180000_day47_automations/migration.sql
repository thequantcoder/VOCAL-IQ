-- Day 47: cross-channel automations. An Automation fires on a trigger event (call_ended,
-- disposition_set, lead_status_changed), optionally filtered, and runs an ordered list of
-- actions (send_message | crm_sync | webhook | task | notify). Tenant-scoped + RLS-protected
-- like every other tenant table (Day 04). Action runs are audited via the existing AuditLog.

CREATE TABLE "Automation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Automation_tenantId_idx" ON "Automation"("tenantId");
CREATE INDEX "Automation_tenantId_event_idx" ON "Automation"("tenantId", "event");

ALTER TABLE "Automation" ADD CONSTRAINT "Automation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Automation"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
