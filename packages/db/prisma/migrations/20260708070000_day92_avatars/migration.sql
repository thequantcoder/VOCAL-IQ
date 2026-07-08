-- Day 92 — Digital-human / video-avatar agents. An Avatar is a tenant's catalogue entry (a custom,
-- real-likeness avatar carries a consent timestamp); an AvatarSession is a rendered video session that
-- is metered per second OR auto-falls back to voice-only. Both tenant-scoped via RLS.

CREATE TABLE "Avatar" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"          UUID NOT NULL,
  "name"              TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "providerAvatarId"  TEXT NOT NULL,
  "kind"              TEXT NOT NULL DEFAULT 'stock',
  "likenessConsentAt" TIMESTAMP(3),
  "active"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Avatar_tenantId_idx" ON "Avatar"("tenantId");
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarSession" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "agentId"        UUID,
  "avatarId"       UUID,
  "mode"           TEXT NOT NULL DEFAULT 'voice',
  "fallback"       BOOLEAN NOT NULL DEFAULT false,
  "fallbackReason" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "seconds"        INTEGER NOT NULL DEFAULT 0,
  "costUsd"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "providerRef"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"        TIMESTAMP(3),
  CONSTRAINT "AvatarSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AvatarSession_tenantId_idx" ON "AvatarSession"("tenantId");
CREATE INDEX "AvatarSession_tenantId_status_idx" ON "AvatarSession"("tenantId", "status");
ALTER TABLE "AvatarSession" ADD CONSTRAINT "AvatarSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: a tenant only ever reads/writes its own avatars + sessions.
ALTER TABLE "Avatar" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Avatar"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "AvatarSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AvatarSession"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
