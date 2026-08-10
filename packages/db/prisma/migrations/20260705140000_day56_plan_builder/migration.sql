-- Day 56 — No-code plan & pricing builder: Stripe linkage + versioning (grandfathering).
ALTER TABLE "Plan"
  ADD COLUMN "stripeProductId" TEXT,
  ADD COLUMN "stripePriceId"   TEXT,
  ADD COLUMN "version"         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "active"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supersededById"  UUID;

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Plan_tenantId_active_idx" ON "Plan"("tenantId", "active");
