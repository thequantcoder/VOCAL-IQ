# DAY 34 — Agent Memory Across Calls (Persistent Context)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 20 (embeddings); confirm retention/privacy defaults.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.3
- DATA-MODEL.md (AgentMemory)
- CODING-RULES.md (PII)

## Objective
Persistent per-contact memory so a returning caller is remembered (objections, preferences, budget, last outcome) with no manual DB setup, plus retention + privacy controls.

## Step-by-step build
1. AgentMemory store: summarise + extract durable facts per contact on call-end; retrieve + inject at call start when memoryEnabled.
2. Retrieval scoped to tenant + contact; respect privacy/retention; contact-level erase (GDPR).
3. UI: view/edit/clear a contact's memory; per-agent enable toggle.
4. Tests: memory write/read, tenant+contact scoping, retention/erase, injection improves continuity (sim).

## Definition of Done
- [ ] Returning callers remembered; memory tenant+contact scoped; erasable; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (PII/retention/erase) + B (scoping — critical) + A.**

## Commit plan
`feat(voice,api,web): cross-call Agent Memory (Day 34)` — branch `day/34-agent-memory` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Synthflow-parity memory. Next (heavy): BYO-SIP trunk engine.
