-- Day 78 — Pay-by-voice payments (customer-of-tenant pays the tenant over a call).
-- PCI out-of-scope: the card is captured by a PCI provider, so this table NEVER stores a PAN/CVV —
-- only an opaque provider ref/token + last4. Integer minor units (cents), never floats.
CREATE TABLE "Payment" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "callId"         UUID,
  "agentId"        UUID,
  "amountCents"    INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "refundedCents"  INTEGER NOT NULL DEFAULT 0,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "provider"       TEXT NOT NULL DEFAULT 'PCI',
  "providerRef"    TEXT,
  "token"          TEXT,
  "last4"          TEXT,
  "description"    TEXT,
  "receiptChannel" TEXT NOT NULL DEFAULT 'none',
  "receiptTo"      TEXT,
  "receiptSentAt"  TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Idempotent charges: a given (tenant, idempotencyKey) can only ever produce one payment (no
-- double-charge). NULL keys are distinct in Postgres, so ad-hoc payments aren't constrained.
CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");
CREATE INDEX "Payment_tenantId_status_idx" ON "Payment"("tenantId", "status");
CREATE INDEX "Payment_tenantId_callId_idx" ON "Payment"("tenantId", "callId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: payments are strictly tenant-scoped — a tenant can never see another tenant's payments.
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
