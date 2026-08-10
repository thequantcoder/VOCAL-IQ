-- Day 27: multi-agent Squads. A Squad chains specialist agents within one live call
-- (receptionist → booking → billing) with handoff rules; SquadMember maps agents in.
-- Both tables are tenant-scoped and RLS-protected like every other tenant table.

CREATE TABLE "Squad" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entryAgentId" UUID,
    "handoffRules" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SquadMember" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "squadId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SquadMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Squad_tenantId_idx" ON "Squad"("tenantId");
CREATE INDEX "SquadMember_tenantId_idx" ON "SquadMember"("tenantId");
CREATE INDEX "SquadMember_squadId_idx" ON "SquadMember"("squadId");
CREATE UNIQUE INDEX "SquadMember_squadId_agentId_key" ON "SquadMember"("squadId", "agentId");

ALTER TABLE "Squad" ADD CONSTRAINT "Squad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "Squad" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Squad"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "SquadMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SquadMember"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
