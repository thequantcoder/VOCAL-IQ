-- WhatsApp Business Calling (WAC-08): the outbound permission governor. A permission per business↔user
-- pair (WhatsAppCallPermission) + an audit of permission-request sends (WhatsAppPermissionRequest) for
-- the 1/24h + 2/7d caps. Both tenant-scoped (RLS), same policy shape as every tenant table.
CREATE TABLE "WhatsAppCallPermission" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"              UUID NOT NULL,
  "waId"                  TEXT NOT NULL,
  "contactId"             UUID,
  "status"                TEXT NOT NULL DEFAULT 'no_permission',
  "expiresAt"             TIMESTAMP(3),
  "source"                TEXT NOT NULL DEFAULT 'request',
  "consecutiveUnanswered" INTEGER NOT NULL DEFAULT 0,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCallPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppCallPermission_tenantId_waId_key" ON "WhatsAppCallPermission"("tenantId", "waId");
CREATE INDEX "WhatsAppCallPermission_tenantId_idx" ON "WhatsAppCallPermission"("tenantId");
ALTER TABLE "WhatsAppCallPermission" ADD CONSTRAINT "WhatsAppCallPermission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCallPermission" ADD CONSTRAINT "WhatsAppCallPermission_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppPermissionRequest" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "waId"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppPermissionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppPermissionRequest_tenantId_waId_createdAt_idx"
  ON "WhatsAppPermissionRequest"("tenantId", "waId", "createdAt");
ALTER TABLE "WhatsAppPermissionRequest" ADD CONSTRAINT "WhatsAppPermissionRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: both tables are tenant-scoped.
ALTER TABLE "WhatsAppCallPermission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppCallPermission"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "WhatsAppPermissionRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppPermissionRequest"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
