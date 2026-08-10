-- Day 43: automated QA scoring. QaRubric = a tenant-defined rubric (criteria + weights +
-- cost-aware sampling rate); QaScore = one LLM-evaluated score per call per rubric. Both
-- tenant-scoped and RLS-protected like every other tenant table (Day 04).

CREATE TABLE "QaRubric" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "samplingRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QaRubric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QaScore" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "rubricId" UUID NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QaScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QaRubric_tenantId_idx" ON "QaRubric"("tenantId");
CREATE INDEX "QaRubric_agentId_idx" ON "QaRubric"("agentId");
CREATE INDEX "QaScore_tenantId_idx" ON "QaScore"("tenantId");
CREATE INDEX "QaScore_tenantId_rubricId_idx" ON "QaScore"("tenantId", "rubricId");
CREATE UNIQUE INDEX "QaScore_callId_rubricId_key" ON "QaScore"("callId", "rubricId");

ALTER TABLE "QaRubric" ADD CONSTRAINT "QaRubric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaRubric" ADD CONSTRAINT "QaRubric_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QaScore" ADD CONSTRAINT "QaScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaScore" ADD CONSTRAINT "QaScore_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaScore" ADD CONSTRAINT "QaScore_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "QaRubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "QaRubric" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaRubric"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "QaScore" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QaScore"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
