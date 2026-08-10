-- VocalIQ local DB init — runs once on first Postgres init (docker-entrypoint-initdb.d).
-- Enables the extensions the data model (Day 4) and later features depend on:
--   timescaledb — time-series hypertables for call/usage events
--   vector      — pgvector embeddings for RAG/knowledge (Day 20)
-- Migrations remain the source of truth in prod; this only primes local dev.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;
