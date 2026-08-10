-- Day 28: campaign retry state on each contact + a status index for monitor/selection.
-- lastDisposition drives the retry state machine; nextAttemptAt gates when a contact is
-- due (null = due now). RLS on CampaignContact already exists from Day 04.
ALTER TABLE "CampaignContact" ADD COLUMN "lastDisposition" TEXT;
ALTER TABLE "CampaignContact" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "CampaignContact_campaignId_status_idx" ON "CampaignContact"("campaignId", "status");
