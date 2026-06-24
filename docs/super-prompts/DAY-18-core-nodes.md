# DAY 18 — Core Nodes — Start, Say, Listen, Decision, End  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 17.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.4 (node types)
- DATA-MODEL.md

## Objective
Implement the five foundational nodes with config UIs + runtime semantics so basic linear/branching conversations are designable visually.

## Step-by-step build
1. Start (persona, opening line, language, voice). Say (scripted or LLM-generated). Listen (extract name/date/number/intent). Decision (route on intent/sentiment/value). End (close + tag outcome).
2. Config UIs per node (packages/ui); variable insertion (dynamic vars from lead).
3. Define each node's runtime contribution to the flow spec (compiler Day 22).
4. Inline single-node preview.
5. Tests: each node config validation + serialised runtime contribution.

## Definition of Done
- [ ] Five core nodes configurable + serialised; basic flow designable; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A + J. Captured-variable typing sound.**

## Commit plan
`feat(web): core builder nodes (Day 18)` — branch `day/18-core-nodes` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Basic flows buildable. Next: tool + webhook nodes.
