# DAY 63 — Performance & Latency Hardening Pass (Voice Loop)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Production-like load; Days 9, 62.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- CODING-RULES.md (#8)
- ARCHITECTURE.md
- Blueprint §13 (risks)

## Objective
Drive perceived latency down and naturalness up across the voice loop: profile every stage, tune endpointing, co-locate infra, optimise streaming, and lock in latency SLOs.

## Step-by-step build
1. Profile the full loop (STT, LLM TTFT, TTS TTFA, network) per provider; build a latency dashboard.
2. Optimise: streaming chunk sizes, prompt/context trimming, speculative/parallel steps, provider/region selection by measured latency, connection reuse.
3. Tune endpointing/turn-taking per use case to cut dead air without cutting people off.
4. Set + enforce latency SLOs; alert on regressions; add a latency regression test in CI.
5. Validate: TTFA + turnaround targets met under concurrency; naturalness improved.

## Definition of Done
- [ ] Measurable latency reductions; SLOs enforced + regression-tested; loop feels natural under load.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **F (the whole day) + A + D (routing-by-latency cost trade-offs).**

## Commit plan
`perf(voice): latency hardening pass + SLOs (Day 63)` — branch `day/63-latency-hardening` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Conversations feel human. Next: security hardening.
