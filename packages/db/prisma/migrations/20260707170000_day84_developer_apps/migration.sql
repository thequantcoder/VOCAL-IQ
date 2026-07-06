-- Day 84 — Developer app / integration marketplace: apps (developer-owned; approved ones browsable
-- cross-tenant), and installs (one per installer+app; mints a scoped API key). RLS scopes owner data;
-- approved apps are read via the admin client filtered to status='approved'.
CREATE TABLE "DeveloperApp" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "developerTenantId" UUID NOT NULL,
  "name"              TEXT NOT NULL,
  "description"       TEXT NOT NULL DEFAULT '',
  "homepageUrl"       TEXT,
  "webhookUrl"        TEXT,
  "clientId"          TEXT NOT NULL,
  "hashedSecret"      TEXT NOT NULL,
  "requestedScopes"   TEXT[] NOT NULL,
  "events"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "priceCents"        INTEGER NOT NULL DEFAULT 0,
  "revShareBps"       INTEGER NOT NULL DEFAULT 7000,
  "status"            TEXT NOT NULL DEFAULT 'draft',
  "scanFindings"      JSONB NOT NULL DEFAULT '[]',
  "installCount"      INTEGER NOT NULL DEFAULT 0,
  "reviewedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeveloperApp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeveloperApp_clientId_key" ON "DeveloperApp"("clientId");
CREATE UNIQUE INDEX "DeveloperApp_hashedSecret_key" ON "DeveloperApp"("hashedSecret");
CREATE INDEX "DeveloperApp_status_idx" ON "DeveloperApp"("status");
CREATE INDEX "DeveloperApp_developerTenantId_status_idx" ON "DeveloperApp"("developerTenantId", "status");
ALTER TABLE "DeveloperApp" ADD CONSTRAINT "DeveloperApp_developerTenantId_fkey"
  FOREIGN KEY ("developerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppInstall" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "installerTenantId" UUID NOT NULL,
  "appId"             UUID NOT NULL,
  "grantedScopes"     TEXT[] NOT NULL,
  "apiKeyId"          UUID,
  "pricePaidCents"    INTEGER NOT NULL DEFAULT 0,
  "developerCents"    INTEGER NOT NULL DEFAULT 0,
  "platformCents"     INTEGER NOT NULL DEFAULT 0,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "consentedAt"       TIMESTAMP(3),
  "revokedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppInstall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppInstall_installerTenantId_appId_key" ON "AppInstall"("installerTenantId", "appId");
CREATE INDEX "AppInstall_installerTenantId_idx" ON "AppInstall"("installerTenantId");
CREATE INDEX "AppInstall_appId_idx" ON "AppInstall"("appId");
ALTER TABLE "AppInstall" ADD CONSTRAINT "AppInstall_installerTenantId_fkey"
  FOREIGN KEY ("installerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppInstall" ADD CONSTRAINT "AppInstall_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: owner-scoped. Apps by developer; installs by installer. Cross-tenant browse of APPROVED apps
-- uses the admin client (bypasses RLS) filtered to status='approved'.
ALTER TABLE "DeveloperApp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeveloperApp"
  USING (is_in_subtree("developerTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("developerTenantId", current_tenant()));
ALTER TABLE "AppInstall" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppInstall"
  USING (is_in_subtree("installerTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("installerTenantId", current_tenant()));
