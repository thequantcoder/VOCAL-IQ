-- Day 59 — Per-tenant enterprise SSO/SAML connection + directory sync.
CREATE TABLE "SsoConnection" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "provider"      TEXT NOT NULL,
  "config"        JSONB NOT NULL DEFAULT '{}',
  "roleMappings"  JSONB NOT NULL DEFAULT '{}',
  "defaultRole"   "Role" NOT NULL DEFAULT 'AGENT',
  "scimTokenHash" TEXT,
  "scimEnabled"   BOOLEAN NOT NULL DEFAULT false,
  "enabled"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SsoConnection_tenantId_key" ON "SsoConnection"("tenantId");
CREATE INDEX "SsoConnection_tenantId_idx" ON "SsoConnection"("tenantId");
ALTER TABLE "SsoConnection"
  ADD CONSTRAINT "SsoConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: a tenant sees only its own SSO connection (self-audit B/C — IdP config isolation).
ALTER TABLE "SsoConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoConnection"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
