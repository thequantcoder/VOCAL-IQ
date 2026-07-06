-- Day 74 — AI coaching copilot: post-call auto-note + disposition draft the human confirms.
CREATE TABLE "CoachNote" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"    UUID NOT NULL,
  "callId"      UUID NOT NULL,
  "disposition" TEXT NOT NULL,
  "notes"       TEXT NOT NULL,
  "confirmed"   BOOLEAN NOT NULL DEFAULT false,
  "confirmedBy" UUID,
  "confirmedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachNote_tenantId_callId_idx" ON "CoachNote"("tenantId", "callId");
ALTER TABLE "CoachNote" ADD CONSTRAINT "CoachNote_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: coach notes are tenant-scoped.
ALTER TABLE "CoachNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CoachNote"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
