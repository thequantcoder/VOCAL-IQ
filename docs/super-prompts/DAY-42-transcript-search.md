# DAY 42 — Transcript Full-Text + Semantic Search  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- pgvector; transcripts populated.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.7
- DATA-MODEL.md (Transcript)

## Objective
Search across every call: keyword (FTS) + semantic (pgvector) with jump-to-moment playback, tenant-scoped.

## Step-by-step build
1. FTS index on transcripts; semantic search via embeddings; hybrid ranking.
2. Search UI: query, filters, snippets, click -> playback at the moment.
3. Tests: FTS + semantic relevance smoke, tenant scoping (no cross-tenant hits), jump-to-moment.

## Definition of Done
- [ ] Keyword + semantic search with jump-to-moment; tenant-scoped; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **B (no cross-tenant results) + F + A.**

## Commit plan
`feat(api,web): transcript full-text + semantic search (Day 42)` — branch `day/42-transcript-search` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Every word searchable. Next: QA scoring at scale.
