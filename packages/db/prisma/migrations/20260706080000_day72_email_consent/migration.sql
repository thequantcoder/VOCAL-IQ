-- Day 72 — Email as a campaign channel + capture-email-mid-call with consent.
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'EMAIL';

ALTER TABLE "Contact"
  ADD COLUMN "emailConsent"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailConsentSource" TEXT,
  ADD COLUMN "emailConsentAt"     TIMESTAMP(3),
  ADD COLUMN "unsubscribedAt"     TIMESTAMP(3);
