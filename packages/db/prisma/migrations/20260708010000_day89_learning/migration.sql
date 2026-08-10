-- Day 89 — Agents learn from top reps: a LearningRun records an analysis of an agent's TOP
-- consent-eligible calls (winning patterns + proposed persona improvements). Tenant-scoped via RLS.
CREATE TABLE "LearningRun" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "agentId"       UUID NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'ready',
  "callsUsed"     INTEGER NOT NULL DEFAULT 0,
  "callsExcluded" INTEGER NOT NULL DEFAULT 0,
  "patterns"      JSONB NOT NULL DEFAULT '[]',
  "suggestions"   JSONB NOT NULL DEFAULT '[]',
  "model"         TEXT,
  "error"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LearningRun_tenantId_idx" ON "LearningRun"("tenantId");
CREATE INDEX "LearningRun_tenantId_agentId_idx" ON "LearningRun"("tenantId", "agentId");
ALTER TABLE "LearningRun" ADD CONSTRAINT "LearningRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant-scoped — a tenant's calls only ever train its own agents.
ALTER TABLE "LearningRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LearningRun"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
