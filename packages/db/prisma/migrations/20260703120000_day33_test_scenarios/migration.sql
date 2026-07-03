-- Day 33: agent test scenarios + eval runs. Both tenant-scoped + RLS-protected.

CREATE TABLE "TestScenario" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestScenario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "passRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "report" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestScenario_tenantId_idx" ON "TestScenario"("tenantId");
CREATE INDEX "TestScenario_agentId_idx" ON "TestScenario"("agentId");
CREATE INDEX "TestRun_tenantId_idx" ON "TestRun"("tenantId");
CREATE INDEX "TestRun_agentId_idx" ON "TestRun"("agentId");

ALTER TABLE "TestScenario" ADD CONSTRAINT "TestScenario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestScenario" ADD CONSTRAINT "TestScenario_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every tenant table (Day 04).
ALTER TABLE "TestScenario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TestScenario"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "TestRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TestRun"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
