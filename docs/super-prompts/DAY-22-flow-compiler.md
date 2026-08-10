# DAY 22 — Flow Compiler — Graph -> Runnable Conversation Spec  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 17-21.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md
- DATA-MODEL.md (FlowVersion)
- Day 9 loop

## Objective
Compile a React Flow graph into a deterministic validated runtime spec the voice loop executes, with active-node tracking, guards, safe handling of cycles/dead-ends.

## Step-by-step build
1. Compiler: graph -> normalised state machine (nodes, transitions, guards, entry/exit actions); validate reachability, no dead-ends, retry/fallback paths.
2. Runtime executor in the loop: track active node, emit node-active events, evaluate branches on captured data/intent/sentiment.
3. Versioning: compiled spec pinned to FlowVersion; safe hot-swap on publish.
4. Tests: compile correctness, dead-end/cycle detection, branch evaluation, executor drives a full simulated conversation.

## Definition of Done
- [ ] Graphs compile to runnable spec; loop executes with active-node tracking; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (determinism, no dead-ends) + F + B.**

## Commit plan
`feat(voice,api): flow compiler + runtime executor (Day 22)` — branch `day/22-flow-compiler` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Visual flows run real calls. Next: test panel + versioning UI.
