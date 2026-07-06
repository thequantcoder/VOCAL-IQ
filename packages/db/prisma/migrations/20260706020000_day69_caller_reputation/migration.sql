-- Day 69 — Caller reputation, branded caller ID, STIR/SHAKEN attestation.
ALTER TABLE "PhoneNumber"
  ADD COLUMN "reputationScore"     INTEGER,
  ADD COLUMN "spamLabel"           TEXT,
  ADD COLUMN "reputationCheckedAt" TIMESTAMP(3),
  ADD COLUMN "restedUntil"         TIMESTAMP(3),
  ADD COLUMN "warmupStartedAt"     TIMESTAMP(3),
  ADD COLUMN "brandedCallerId"     JSONB;

ALTER TABLE "Call" ADD COLUMN "attestation" TEXT;
