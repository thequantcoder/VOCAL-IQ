-- Day 38: cost/reliability protection — per-agent auto-hangup + banned-words action,
-- and key-pool health tracking for load-balanced platform keys.

ALTER TABLE "Agent" ADD COLUMN "maxCallDurationSec" INTEGER NOT NULL DEFAULT 600;
ALTER TABLE "Agent" ADD COLUMN "maxSilenceSec" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Agent" ADD COLUMN "endOnVoicemail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Agent" ADD COLUMN "bannedWordsAction" TEXT NOT NULL DEFAULT 'flag';

ALTER TABLE "PlatformApiKeyPool" ADD COLUMN "label" TEXT;
ALTER TABLE "PlatformApiKeyPool" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformApiKeyPool" ADD COLUMN "lastFailureAt" TIMESTAMP(3);
