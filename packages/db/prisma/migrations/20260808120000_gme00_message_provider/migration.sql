-- GME-00: record which registry provider sent each message (foundation for multi-provider SMS +
-- per-provider delivery analytics). Additive, nullable — safe on existing rows.
ALTER TABLE "Message" ADD COLUMN "providerId" TEXT;
