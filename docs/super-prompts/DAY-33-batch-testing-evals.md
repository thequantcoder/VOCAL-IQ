# DAY 33 — Batch/Scenario Testing + Automated Eval Rubrics  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 32 simulator.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.2
- TECH-STACK.md (promptfoo/deepeval)

## Objective
Run dozens of simulated scenarios in bulk against an agent + grade with LLM rubrics, producing pass/fail reports that catch regressions before real callers.

## Step-by-step build
1. Scenario definitions: caller persona + goal + expected outcomes/assertions; scenario library per agent.
2. Batch runner (workers): execute scenarios via simulator in parallel; collect transcripts + outcomes.
3. LLM-graded rubrics (confirmed appointment? on script? handled objection?); pass/fail + score; promptfoo/deepeval patterns.
4. Report UI + CI hook (run suite on agent publish).
5. Tests: batch execution, rubric determinism (seeded), regression detection.

## Definition of Done
- [ ] Batch scenario suites run + grade agents; pass/fail reports; CI-on-publish; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (grading reliability) + D (eval cost) + B.**

## Commit plan
`feat(workers,web): batch scenario testing + eval rubrics (Day 33)` — branch `day/33-batch-testing-evals` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Agents QA'd before launch (Retell-parity). Next: Agent Memory.
