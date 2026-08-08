-- GME-01: per-tenant BYOK vault for messaging providers. Multi-field credential SET stored as ONE
-- envelope-encrypted JSON blob (ciphertext only). tenantId NULL = a platform-managed default.

CREATE TABLE "MessagingCredential" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID,
  "providerId"     TEXT NOT NULL,
  "encryptedCreds" BYTEA NOT NULL,
  "meta"           JSONB NOT NULL DEFAULT '{}',
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingCredential_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MessagingCredential"
  ADD CONSTRAINT "MessagingCredential_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "MessagingCredential_tenantId_idx" ON "MessagingCredential" ("tenantId");
CREATE INDEX "MessagingCredential_providerId_idx" ON "MessagingCredential" ("providerId");

-- Exactly one row per (tenant-or-platform, provider). NULLS NOT DISTINCT (PG15+) makes the single
-- platform row (tenantId NULL) unique too, which a normal unique index would not enforce.
CREATE UNIQUE INDEX "MessagingCredential_tenantId_providerId_key"
  ON "MessagingCredential" ("tenantId", "providerId") NULLS NOT DISTINCT;

-- Tenant isolation, mirroring ProviderCredential (Day 04 RLS). Platform rows (tenantId NULL) are
-- reachable only via the superuser/admin path; a tenant sees only its own subtree.
ALTER TABLE "MessagingCredential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessagingCredential"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
