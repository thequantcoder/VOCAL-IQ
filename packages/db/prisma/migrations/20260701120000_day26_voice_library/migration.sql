-- Day 26: voice library filters + cloning approval gate.
-- New optional descriptor columns (age/accent) for library filtering, and an `approved`
-- flag that keeps cloned voices UNUSABLE until an operator signs off (consent gate).
ALTER TABLE "Voice" ADD COLUMN "age" TEXT;
ALTER TABLE "Voice" ADD COLUMN "accent" TEXT;
ALTER TABLE "Voice" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;

-- Existing (non-cloned preset) rows are usable by definition — mark them approved so the
-- `isVoiceUsable` predicate is satisfied for anything that predates this migration.
UPDATE "Voice" SET "approved" = true WHERE "isCloned" = false;
