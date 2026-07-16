-- WhatsApp Business Calling (WAC-02): add WHATSAPP to CallChannel + the WhatsApp call lifecycle
-- (WhatsAppCall) and append-only webhook audit (WhatsAppCallEvent) tables. Both tenant-scoped (RLS).
ALTER TYPE "CallChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';

CREATE TABLE "WhatsAppCall" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"         UUID NOT NULL,
  "waCallId"         TEXT NOT NULL,
  "direction"        TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'connecting',
  "fromNumber"       TEXT,
  "toNumber"         TEXT,
  "waUserId"         TEXT,
  "ctaPayload"       TEXT,
  "deeplinkPayload"  TEXT,
  "permissionStatus" TEXT,
  "callId"           UUID,
  "errorCode"        INTEGER,
  "startedAt"        TIMESTAMP(3),
  "endedAt"          TIMESTAMP(3),
  "durationSec"      INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppCall_tenantId_waCallId_key" ON "WhatsAppCall"("tenantId", "waCallId");
CREATE INDEX "WhatsAppCall_tenantId_idx" ON "WhatsAppCall"("tenantId");
CREATE INDEX "WhatsAppCall_tenantId_status_idx" ON "WhatsAppCall"("tenantId", "status");
ALTER TABLE "WhatsAppCall" ADD CONSTRAINT "WhatsAppCall_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppCallEvent" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "waCallId"  TEXT NOT NULL,
  "event"     TEXT NOT NULL,
  "payload"   JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCallEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppCallEvent_tenantId_waCallId_idx" ON "WhatsAppCallEvent"("tenantId", "waCallId");
ALTER TABLE "WhatsAppCallEvent" ADD CONSTRAINT "WhatsAppCallEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: WhatsApp calls + events are tenant-scoped (same policy shape as every tenant table).
ALTER TABLE "WhatsAppCall" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppCall"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "WhatsAppCallEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppCallEvent"
  USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));
