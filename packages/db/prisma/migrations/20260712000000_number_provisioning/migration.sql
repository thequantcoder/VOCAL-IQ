-- Number provisioning: store the carrier's resource id on a PhoneNumber so a purchased number can be
-- released back to the carrier (e.g. Twilio IncomingPhoneNumber SID). Nullable + additive; POOL/SIP
-- numbers leave it null. RLS is unchanged (the tenant_isolation policy from Day 04 still applies).
ALTER TABLE "PhoneNumber" ADD COLUMN "providerSid" TEXT;
