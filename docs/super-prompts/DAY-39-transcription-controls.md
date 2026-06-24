# DAY 39 — Advanced Transcription Controls + Source Attribution  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Deepgram/AssemblyAI; Day 20 RAG.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.3
- DATA-MODEL.md (Transcript, KbChunk)

## Objective
Improve transcript quality + trust: custom key-term boosting (brand/drug/SKU), no-verbatim mode (strip fillers/false starts), RAG source attribution.

## Step-by-step build
1. Key-term boosting: per-agent custom vocabulary passed to STT.
2. No-verbatim mode: clean transcripts removing fillers/false starts (store raw + clean).
3. Source attribution: when KB content used, record + display which chunks/sources.
4. Tests: key-term effect (where mockable), no-verbatim cleaning, attribution recorded + displayed.

## Definition of Done
- [ ] Key-terms + no-verbatim + source attribution work; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A + B + D.**

## Commit plan
`feat(voice,web): key-terms, no-verbatim, RAG source attribution (Day 39)` — branch `day/39-transcription-controls` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Transcripts cleaner + trustworthy. Next: built-in CRM/helpdesk integrations.
