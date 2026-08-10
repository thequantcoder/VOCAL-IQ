-- Day 44: multi-channel messaging. WhatsApp/SMS templates, per-message rows (outbound +
-- inbound + status), and per-channel opt-out suppression. All tenant-scoped + RLS-protected
-- like every other tenant table (Day 04). Fresh enum types (safe CREATE TYPE — no ALTER of
-- the shared Provider/Capability enums).

CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS');
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');

CREATE TABLE "MessageTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT NOT NULL DEFAULT 'utility',
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "providerTemplateId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "toAddr" TEXT NOT NULL,
    "fromAddr" TEXT,
    "body" TEXT NOT NULL,
    "templateId" UUID,
    "contactId" UUID,
    "callId" UUID,
    "campaignId" UUID,
    "providerMessageId" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessagingOptOut" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessagingOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTemplate_tenantId_channel_name_language_key" ON "MessageTemplate"("tenantId", "channel", "name", "language");
CREATE INDEX "MessageTemplate_tenantId_idx" ON "MessageTemplate"("tenantId");
CREATE INDEX "Message_tenantId_idx" ON "Message"("tenantId");
CREATE INDEX "Message_tenantId_status_idx" ON "Message"("tenantId", "status");
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");
CREATE UNIQUE INDEX "MessagingOptOut_tenantId_channel_phone_key" ON "MessagingOptOut"("tenantId", "channel", "phone");
CREATE INDEX "MessagingOptOut_tenantId_idx" ON "MessagingOptOut"("tenantId");

ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessagingOptOut" ADD CONSTRAINT "MessagingOptOut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessageTemplate"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "MessagingOptOut" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MessagingOptOut"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
