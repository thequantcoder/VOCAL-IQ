-- Day 67 — Agent Desk: human-agent presence + queued human transfers.
CREATE TABLE "AgentPresence" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "membershipId"   UUID NOT NULL,
  "userId"         UUID NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'away',
  "skills"         TEXT[] NOT NULL DEFAULT '{}',
  "activeCalls"    INTEGER NOT NULL DEFAULT 0,
  "lastAssignedAt" TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentPresence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentPresence_membershipId_key" ON "AgentPresence"("membershipId");
CREATE INDEX "AgentPresence_tenantId_status_idx" ON "AgentPresence"("tenantId", "status");
ALTER TABLE "AgentPresence" ADD CONSTRAINT "AgentPresence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TransferRequest" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"             UUID NOT NULL,
  "callId"               UUID NOT NULL,
  "handoffType"          TEXT NOT NULL DEFAULT 'cold',
  "strategy"             TEXT NOT NULL DEFAULT 'round_robin',
  "requiredSkill"        TEXT,
  "warmSummary"          TEXT,
  "status"               TEXT NOT NULL DEFAULT 'queued',
  "assignedMembershipId" UUID,
  "waitStartedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt"           TIMESTAMP(3),
  "endedAt"              TIMESTAMP(3),
  CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransferRequest_tenantId_status_idx" ON "TransferRequest"("tenantId", "status");
CREATE INDEX "TransferRequest_callId_idx" ON "TransferRequest"("callId");
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: the desk + queue are tenant-scoped (a human agent only ever sees its own tenant's calls).
ALTER TABLE "AgentPresence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgentPresence"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "TransferRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TransferRequest"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
