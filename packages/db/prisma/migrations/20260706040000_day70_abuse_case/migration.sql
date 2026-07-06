-- Day 70 — Fraud/abuse cases: the auditable record of an automated enforcement + its review.
CREATE TABLE "AbuseCase" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID NOT NULL,
  "score"      INTEGER NOT NULL,
  "action"     TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'open',
  "reasons"    TEXT[] NOT NULL DEFAULT '{}',
  "notes"      TEXT,
  "resolvedBy" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AbuseCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AbuseCase_tenantId_status_idx" ON "AbuseCase"("tenantId", "status");
CREATE INDEX "AbuseCase_status_idx" ON "AbuseCase"("status");
ALTER TABLE "AbuseCase" ADD CONSTRAINT "AbuseCase_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: a tenant sees its own cases; the super-admin console spans all via the owner client.
ALTER TABLE "AbuseCase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AbuseCase"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
