-- Day 42: transcript full-text + semantic search.
-- Add a flattened plain-text column (FTS source + embedding source) and a pgvector
-- column for semantic search, plus the matching GIN (FTS) and HNSW (cosine) indexes.
-- Transcript already has RLS (Day 04), so these columns inherit tenant isolation.

ALTER TABLE "Transcript" ADD COLUMN "searchText" TEXT;
ALTER TABLE "Transcript" ADD COLUMN "embedding" vector(1536);

-- Full-text search over the flattened transcript text (English config).
CREATE INDEX IF NOT EXISTS "Transcript_searchText_fts"
  ON "Transcript" USING gin (to_tsvector('english', coalesce("searchText", '')));

-- Approximate nearest-neighbour for semantic search (cosine distance).
CREATE INDEX IF NOT EXISTS "Transcript_embedding_hnsw"
  ON "Transcript" USING hnsw (embedding vector_cosine_ops);
