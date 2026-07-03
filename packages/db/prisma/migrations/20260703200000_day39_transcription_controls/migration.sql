-- Day 39: advanced transcription controls — per-agent STT key-terms + no-verbatim mode,
-- plus a clean transcript copy and RAG source attribution on the transcript.

ALTER TABLE "Agent" ADD COLUMN "keyTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Agent" ADD COLUMN "noVerbatim" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Transcript" ADD COLUMN "cleanSegments" JSONB;
ALTER TABLE "Transcript" ADD COLUMN "sources" JSONB NOT NULL DEFAULT '[]';
