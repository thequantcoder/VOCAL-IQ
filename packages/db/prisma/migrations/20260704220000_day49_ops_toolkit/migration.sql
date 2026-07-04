-- Day 49: SaaS ops toolkit. Bonus/perk credits are tracked separately from prepaid balance on
-- the Wallet and drained FIRST. Tickets, phone-number pool, and notifications all reuse the
-- existing Day-04 models (SupportTicket, PhoneNumber, Notification); trial limits live in
-- Tenant.settings (no schema change).

ALTER TABLE "Wallet" ADD COLUMN "bonusCents" INTEGER NOT NULL DEFAULT 0;
