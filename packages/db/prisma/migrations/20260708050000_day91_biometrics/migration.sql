-- Day 91 — Voice biometrics (caller identity verification). A Voiceprint stores an enrolled caller's
-- embedding ENCRYPTED at rest (never raw); a VoiceprintAudit records every enroll/verify/erase. Both
-- tenant-scoped via RLS. Biometrics are the most sensitive PII — default-deny governance lives in the
-- service (consent-gated, region-gated, off by default).

CREATE TABLE "Voiceprint" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "contactId" TEXT NOT NULL,
  "region"    TEXT NOT NULL,
  "provider"  TEXT NOT NULL,
  "dims"      INTEGER NOT NULL,
  "vector"    BYTEA NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Voiceprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Voiceprint_tenantId_contactId_key" ON "Voiceprint"("tenantId", "contactId");
CREATE INDEX "Voiceprint_tenantId_idx" ON "Voiceprint"("tenantId");
ALTER TABLE "Voiceprint" ADD CONSTRAINT "Voiceprint_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VoiceprintAudit" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "contactId" TEXT NOT NULL,
  "event"     TEXT NOT NULL,
  "outcome"   TEXT,
  "score"     DOUBLE PRECISION,
  "liveness"  DOUBLE PRECISION,
  "region"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceprintAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceprintAudit_tenantId_contactId_idx" ON "VoiceprintAudit"("tenantId", "contactId");
ALTER TABLE "VoiceprintAudit" ADD CONSTRAINT "VoiceprintAudit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: a tenant only ever reads/writes its own voiceprints + audits.
ALTER TABLE "Voiceprint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Voiceprint"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "VoiceprintAudit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VoiceprintAudit"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
