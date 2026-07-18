-- Messenger (Meta) Calling (MEC-02): the Messenger call lifecycle (MessengerCall) + append-only webhook
-- audit (MessengerCallEvent). WhatsApp-Calling sibling, but identity is a PSID + Page (no phone numbers).
-- Both tenant-scoped (RLS). CallChannel.MESSENGER was added in 20260718120000_messenger_calling_enums.

CREATE TABLE "MessengerCall" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"    UUID NOT NULL,
  "meCallId"    TEXT NOT NULL,
  "direction"   TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'connecting',
  "psid"        TEXT,
  "pageId"      TEXT,
  "refPayload"  TEXT,
  "callId"      UUID,
  "errorCode"   INTEGER,
  "startedAt"   TIMESTAMP(3),
  "endedAt"     TIMESTAMP(3),
  "durationSec" INTEGER,
  "costUsd"     DOUBLE PRECISION,
  "billedAt"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessengerCall_tenantId_meCallId_key" ON "MessengerCall"("tenantId", "meCallId");
CREATE INDEX "MessengerCall_tenantId_idx" ON "MessengerCall"("tenantId");
CREATE INDEX "MessengerCall_tenantId_status_idx" ON "MessengerCall"("tenantId", "status");
ALTER TABLE "MessengerCall" ADD CONSTRAINT "MessengerCall_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessengerCallEvent" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "meCallId"  TEXT NOT NULL,
  "event"     TEXT NOT NULL,
  "payload"   JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessengerCallEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessengerCallEvent_tenantId_meCallId_idx" ON "MessengerCallEvent"("tenantId", "meCallId");
ALTER TABLE "MessengerCallEvent" ADD CONSTRAINT "MessengerCallEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: Messenger calls + events are tenant-scoped (same policy shape as every tenant table).
ALTER TABLE "MessengerCall" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessengerCall"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "MessengerCallEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessengerCallEvent"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
