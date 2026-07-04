-- Day 53: reseller money engine. An append-only wallet ledger (every top-up/charge/refund is an
-- immutable entry; balance = sum) with a per-tenant unique idempotency key so replaying a charge
-- never double-debits. Integer minor units (cents) only. Wallet gains a currency. Reseller margins
-- reuse the existing ResellerMargin table. Tenant-scoped + RLS-protected (Day 04).

ALTER TABLE "Wallet" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE "WalletLedger" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "callId" UUID,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletLedger_tenantId_idempotencyKey_key" ON "WalletLedger"("tenantId", "idempotencyKey");
CREATE INDEX "WalletLedger_tenantId_idx" ON "WalletLedger"("tenantId");
CREATE INDEX "WalletLedger_tenantId_createdAt_idx" ON "WalletLedger"("tenantId", "createdAt");

ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every other tenant table (Day 04).
ALTER TABLE "WalletLedger" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WalletLedger"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
