-- Day 46: MCP / external tool servers. Per-tenant (optionally per-agent) registrations with a
-- trust context (LOW/HIGH/UNKNOWN), a per-server response timeout, a sealed auth header, and
-- the discovered tool descriptors. Tenant-scoped + RLS-protected like every other tenant table
-- (Day 04). Tool-call auditing reuses the existing AuditLog table.

CREATE TABLE "McpServer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'http',
    "trustContext" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "authHeaderCipher" TEXT,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "McpServer_tenantId_idx" ON "McpServer"("tenantId");
CREATE INDEX "McpServer_agentId_idx" ON "McpServer"("agentId");

ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "McpServer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "McpServer"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
