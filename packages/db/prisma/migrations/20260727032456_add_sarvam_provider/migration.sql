-- India-first: Sarvam AI provider (STT/TTS/LLM/translation for 22 Indian languages).
-- Clean enum append only. `prisma migrate dev` also bundled pre-existing drift (dropping the
-- pgvector HNSW indexes + stripping uuid defaults — not represented in schema.prisma); that is
-- DESTRUCTIVE (RAG/search) and was removed by hand, matching the prior provider-enum migrations.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'SARVAM';
