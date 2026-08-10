-- Day 35: BYO-SIP trunk — non-secret connection columns (name/host/port). Credentials stay
-- in encryptedCreds (Bytes); RLS on SipTrunk already exists from Day 04.
ALTER TABLE "SipTrunk" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SipTrunk" ADD COLUMN "host" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SipTrunk" ADD COLUMN "port" INTEGER NOT NULL DEFAULT 5060;
