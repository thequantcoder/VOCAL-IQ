-- Day 83 — Agent-template marketplace: listings (creator-owned; approved ones browsable cross-tenant),
-- purchases (one per buyer+listing), and reviews. RLS scopes owner data; approved listings are read
-- via the admin client filtered to status='approved'.
CREATE TABLE "MarketplaceListing" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "creatorTenantId" UUID NOT NULL,
  "sourceAgentId"   UUID,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL DEFAULT '',
  "priceCents"      INTEGER NOT NULL DEFAULT 0,
  "revShareBps"     INTEGER NOT NULL DEFAULT 7000,
  "status"          TEXT NOT NULL DEFAULT 'draft',
  "snapshot"        JSONB NOT NULL DEFAULT '{}',
  "version"         INTEGER NOT NULL DEFAULT 1,
  "ratingSum"       INTEGER NOT NULL DEFAULT 0,
  "ratingCount"     INTEGER NOT NULL DEFAULT 0,
  "purchaseCount"   INTEGER NOT NULL DEFAULT 0,
  "reviewedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");
CREATE INDEX "MarketplaceListing_creatorTenantId_status_idx" ON "MarketplaceListing"("creatorTenantId", "status");
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_creatorTenantId_fkey"
  FOREIGN KEY ("creatorTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketplacePurchase" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "buyerTenantId"  UUID NOT NULL,
  "listingId"      UUID NOT NULL,
  "pricePaidCents" INTEGER NOT NULL,
  "creatorCents"   INTEGER NOT NULL,
  "platformCents"  INTEGER NOT NULL,
  "clonedAgentId"  UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplacePurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplacePurchase_buyerTenantId_listingId_key" ON "MarketplacePurchase"("buyerTenantId", "listingId");
CREATE INDEX "MarketplacePurchase_buyerTenantId_idx" ON "MarketplacePurchase"("buyerTenantId");
CREATE INDEX "MarketplacePurchase_listingId_idx" ON "MarketplacePurchase"("listingId");
ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_buyerTenantId_fkey"
  FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketplaceReview" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "buyerTenantId" UUID NOT NULL,
  "listingId"     UUID NOT NULL,
  "rating"        INTEGER NOT NULL,
  "comment"       TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketplaceReview_buyerTenantId_listingId_key" ON "MarketplaceReview"("buyerTenantId", "listingId");
CREATE INDEX "MarketplaceReview_listingId_idx" ON "MarketplaceReview"("listingId");
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_buyerTenantId_fkey"
  FOREIGN KEY ("buyerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: owner-scoped. Listings by creator; purchases + reviews by buyer. Cross-tenant browse of
-- APPROVED listings uses the admin client (bypasses RLS) filtered to status='approved'.
ALTER TABLE "MarketplaceListing" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarketplaceListing"
  USING (is_in_subtree("creatorTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("creatorTenantId", current_tenant()));
ALTER TABLE "MarketplacePurchase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarketplacePurchase"
  USING (is_in_subtree("buyerTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("buyerTenantId", current_tenant()));
ALTER TABLE "MarketplaceReview" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MarketplaceReview"
  USING (is_in_subtree("buyerTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("buyerTenantId", current_tenant()));
