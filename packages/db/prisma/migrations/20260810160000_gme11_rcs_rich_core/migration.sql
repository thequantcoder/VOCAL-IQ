-- GME-11: rich RCS payload + cascade fallback provenance on Message. Additive nullable columns.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "richPayload" JSONB;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "fallbackFrom" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "fallbackTo" TEXT;
