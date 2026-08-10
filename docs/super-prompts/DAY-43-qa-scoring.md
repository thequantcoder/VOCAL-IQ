# DAY 43 — Automated QA Scoring (LLM Rubrics) at Scale  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- LLM keys; transcripts; Day 33 rubric patterns.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.7
- DATA-MODEL.md

## Objective
Score live calls automatically against tenant-defined rubrics (followed script? confirmed booking? handled objection? compliance?) using an LLM evaluator, surfaced in analytics + coaching.

## Step-by-step build
1. Rubric builder (criteria + weights); evaluator worker scores a sample (or all) of live calls.
2. Store scores on Call/Transcript; aggregate into analytics + coaching views.
3. Cost-aware sampling (configurable) for high volume.
4. Tests: scoring determinism (seeded), aggregation, sampling, cost metered.

## Definition of Done
- [ ] Live calls auto-scored against rubrics; surfaced in analytics; cost-aware; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (eval cost) + A (reliability) + B.**

## Commit plan
`feat(workers,web): automated QA scoring at scale (Day 43)` — branch `day/43-qa-scoring` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Quality measurable. Next (heavy): multi-channel messaging.
