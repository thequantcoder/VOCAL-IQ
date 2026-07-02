-- Day 31: post-call intelligence fields on the transcript (summary/keywords already exist).
ALTER TABLE "Transcript" ADD COLUMN "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Transcript" ADD COLUMN "entities" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Transcript" ADD COLUMN "sentiment" TEXT;
ALTER TABLE "Transcript" ADD COLUMN "intelAt" TIMESTAMP(3);
