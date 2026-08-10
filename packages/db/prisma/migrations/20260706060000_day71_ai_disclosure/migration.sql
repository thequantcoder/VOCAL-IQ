-- Day 71 — AI disclosure compliance: the defensible per-call record of what was disclosed + opt-out.
ALTER TABLE "Call"
  ADD COLUMN "disclosureText" TEXT,
  ADD COLUMN "disclosedAt"    TIMESTAMP(3),
  ADD COLUMN "humanOptOutAt"  TIMESTAMP(3);
