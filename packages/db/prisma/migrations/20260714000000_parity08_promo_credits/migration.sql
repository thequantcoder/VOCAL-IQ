-- PARITY-08 — Promotional / bonus credits.
-- Grants are a credit pool spent BEFORE the paid wallet balance, can expire, and never pay out as
-- cash. Each charge records how much was promo- vs paid-funded so cost attribution stays exact.

-- The promo portion of every charge is recorded on the ledger; `amountCents` stays the PAID portion
-- so the invariant `Wallet.balanceCents = sum(WalletLedger.amountCents)` is preserved.
ALTER TABLE "WalletLedger" ADD COLUMN "promoCents" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "GrantKind" AS ENUM ('PROMO', 'BONUS', 'REFERRAL', 'MANUAL');

-- Platform-global promo-code catalog (no tenantId). Redemption creates a tenant CreditGrant.
CREATE TABLE "PromoCode" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "code"           TEXT NOT NULL,
  "kind"           "GrantKind" NOT NULL DEFAULT 'PROMO',
  "amountCents"    INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "maxRedemptions" INTEGER,
  "perTenantLimit" INTEGER NOT NULL DEFAULT 1,
  "redeemedCount"  INTEGER NOT NULL DEFAULT 0,
  "expiresAt"      TIMESTAMP(3),
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdBy"      UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");

-- Tenant credit grant: a pool drained before paid credits; `remainingCents` decremented as usage
-- is charged; `revokedAt`/`expiresAt` exclude it from spend.
CREATE TABLE "CreditGrant" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       UUID NOT NULL,
  "kind"           "GrantKind" NOT NULL,
  "source"         TEXT NOT NULL,
  "amountCents"    INTEGER NOT NULL,
  "remainingCents" INTEGER NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "expiresAt"      TIMESTAMP(3),
  "revokedAt"      TIMESTAMP(3),
  "createdBy"      UUID,
  "promoCodeId"    UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreditGrant_tenantId_idx" ON "CreditGrant"("tenantId");
CREATE INDEX "CreditGrant_tenantId_remainingCents_idx" ON "CreditGrant"("tenantId", "remainingCents");
CREATE INDEX "CreditGrant_promoCodeId_idx" ON "CreditGrant"("promoCodeId");

ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: credit grants are tenant-scoped (same shape as every other tenant table).
ALTER TABLE "CreditGrant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditGrant"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

-- PromoCode is platform-global and only ever read/written via the owner (superuser) client. Enable
-- RLS with NO policy so the RLS-constrained app role can never read the code catalog directly.
ALTER TABLE "PromoCode" ENABLE ROW LEVEL SECURITY;
