-- Day 90 — Live Call Co-Pilot for human sales teams. A CopilotSession assists a human rep on their
-- OWN live call (no VocalIQ Agent/Call required); a Battlecard is a tenant-authored competitor card.
-- Both tenant-scoped via RLS.

CREATE TABLE "CopilotSession" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL,
  "userId"       UUID,
  "membershipId" UUID,
  "title"        TEXT,
  "contactName"  TEXT,
  "company"      TEXT,
  "channel"      TEXT NOT NULL DEFAULT 'web',
  "status"       TEXT NOT NULL DEFAULT 'live',
  "turns"        JSONB NOT NULL DEFAULT '[]',
  "crmDraft"     JSONB,
  "crmConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "durationSec"  INTEGER NOT NULL DEFAULT 0,
  "model"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"      TIMESTAMP(3),
  CONSTRAINT "CopilotSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CopilotSession_tenantId_idx" ON "CopilotSession"("tenantId");
CREATE INDEX "CopilotSession_tenantId_status_idx" ON "CopilotSession"("tenantId", "status");
ALTER TABLE "CopilotSession" ADD CONSTRAINT "CopilotSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Battlecard" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL,
  "competitor"    TEXT NOT NULL,
  "cues"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "talkingPoints" JSONB NOT NULL DEFAULT '[]',
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Battlecard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Battlecard_tenantId_idx" ON "Battlecard"("tenantId");
ALTER TABLE "Battlecard" ADD CONSTRAINT "Battlecard_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: both tables are tenant-scoped — a rep only ever sees their own tenant's sessions + battlecards.
ALTER TABLE "CopilotSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CopilotSession"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "Battlecard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Battlecard"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
