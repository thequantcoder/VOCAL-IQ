-- Day 85 — Visual workflow automation: workflows (a validated acyclic DAG of trigger/condition/action/
-- delay/end nodes), runs (durable executions), and run steps (the observability log). All tenant-scoped
-- via RLS; the durable worker uses the admin client (it spans tenants) but every row carries tenantId.
CREATE TABLE "Workflow" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL,
  "name"         TEXT NOT NULL,
  "graph"        JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  "triggerEvent" TEXT,
  "status"       TEXT NOT NULL DEFAULT 'draft',
  "version"      INTEGER NOT NULL DEFAULT 1,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Workflow_tenantId_idx" ON "Workflow"("tenantId");
CREATE INDEX "Workflow_tenantId_status_triggerEvent_idx" ON "Workflow"("tenantId", "status", "triggerEvent");
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowRun" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "workflowId"    UUID NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'running',
  "context"       JSONB NOT NULL DEFAULT '{}',
  "currentNodeId" TEXT,
  "stepCount"     INTEGER NOT NULL DEFAULT 0,
  "error"         TEXT,
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"    TIMESTAMP(3),
  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowRun_tenantId_workflowId_idx" ON "WorkflowRun"("tenantId", "workflowId");
CREATE INDEX "WorkflowRun_tenantId_status_idx" ON "WorkflowRun"("tenantId", "status");
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowRunStep" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "runId"     UUID NOT NULL,
  "nodeId"    TEXT NOT NULL,
  "nodeType"  TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "detail"    TEXT,
  "attempt"   INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowRunStep_tenantId_runId_idx" ON "WorkflowRunStep"("tenantId", "runId");
CREATE INDEX "WorkflowRunStep_runId_idx" ON "WorkflowRunStep"("runId");
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: every table scoped to its tenant. The worker uses the admin client (bypasses RLS) because it
-- legitimately spans tenants, but always filters by the run's tenantId.
ALTER TABLE "Workflow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Workflow"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "WorkflowRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkflowRun"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "WorkflowRunStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkflowRunStep"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
