# DAY 20 — Knowledge Node + RAG Ingestion (pgvector)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- OPENAI_API_KEY (embeddings) or chosen embed provider; pgvector enabled (Day 4).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md (KnowledgeBase, KbChunk)
- ARCHITECTURE.md (RAG)
- CODING-RULES.md

## Objective
Ground agents in tenant content: upload PDFs/DOCs/TXT/URLs/text, chunk + embed into pgvector, Knowledge node retrieves during calls with optional source attribution.

## Step-by-step build
1. Ingestion pipeline (workers): parse PDF/DOC/TXT, crawl URL, accept text; chunk; embed via router; store KbChunk tenant-scoped + embedding.
2. Knowledge node: embed query, vector-search the tenant KB (HNSW/IVFFlat), inject top-k into LLM context.
3. Source attribution toggle (which chunks used) — prep Day 39.
4. KB management UI: create KB, upload, ingestion status, re-index.
5. Tests: ingestion, tenant-scoped retrieval (no cross-tenant chunks), top-k relevance smoke, attribution.

## Definition of Done
- [ ] Agents answer from tenant KB via RAG; ingestion + retrieval tenant-scoped; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (no cross-tenant chunks — critical) + D (embedding cost) + F (vector index).**

## Commit plan
`feat(workers,voice,web): RAG knowledge node + pgvector ingestion (Day 20)` — branch `day/20-knowledge-rag` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Agents grounded. Next: collect/transfer/sub-flow nodes.
