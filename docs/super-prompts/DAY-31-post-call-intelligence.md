# DAY 31 — Post-Call Intelligence — AI Summary + Keyword Extraction  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 12 transcripts; LLM keys.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.2
- DATA-MODEL.md (Transcript)

## Objective
After each call, auto-generate a concise summary, extract keywords/topics/entities, provide audio-synced player.

## Step-by-step build
1. Worker on call-end: LLM summary + keyword/topic/entity extraction (router, metered); store on Transcript.
2. Audio player synced to transcript (wavesurfer) with jump-to-moment.
3. Surface summary/keywords in call detail + lead timeline.
4. Tests: summary/keyword generation (mocked), storage, player sync, cost metered.

## Definition of Done
- [ ] Every call has summary + keywords + synced playback; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (LLM cost) + B + A.**

## Commit plan
`feat(workers,web): post-call summaries + keywords (Day 31)` — branch `day/31-post-call-intelligence` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Calls skimmable. Next: agent testing suite.
