-- GME-14: per-channel messaging consent on Contact (lawful basis to SMS/WhatsApp/RCS). Additive columns.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "smsConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "whatsappConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "rcsConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "messagingConsentBasis" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "messagingConsentAt" TIMESTAMP(3);
