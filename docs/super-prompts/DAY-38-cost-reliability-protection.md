# DAY 38 — Cost/Reliability Protection — Auto Hang-Up, Key-Pool LB, Turn Timeout, Banned Words  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 7-13.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §4.5
- DATA-MODEL.md (PlatformApiKeyPool)
- CODING-RULES.md

## Objective
Protect margin + reliability: smart auto hang-up (max duration + silence/voicemail), load-balanced provider key pools, per-agent turn-timeout UI, banned/blocked-words guardrails.

## Step-by-step build
1. Smart auto hang-up: max call duration + silence/dead-air auto-hangup (e.g. 15s) so runaway calls don't burn credits.
2. Key-pool LB: rotate/balance across multiple provider keys (PlatformApiKeyPool) to sustain concurrency + avoid rate limits; health-check + eject bad keys.
3. Per-agent turn-timeout slider (0.5-5.0s) wired into the loop.
4. Banned/blocked words per agent (block/flag prohibited terms in agent speech).
5. Tests: auto-hangup triggers, key rotation + ejection, turn-timeout applied, banned-words enforcement.

## Definition of Done
- [ ] Runaway calls auto-end; key pools balance load; turn timeout + banned words enforced; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (cost protection) + C (guardrails, keys) + F (concurrency).**

## Commit plan
`feat(voice,api): auto-hangup, key-pool LB, turn timeout, banned words (Day 38)` — branch `day/38-cost-reliability-protection` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Margin + reliability protected. Next: advanced transcription controls.
