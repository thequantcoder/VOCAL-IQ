# DAY 29 — Lead Workspace + Custom Fields + Tags + Hot/Warm/Cold Scoring  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 28; Day 13 cost engine.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- Blueprint §4.1
- DATA-MODEL.md (Contact, Lead)
- packages/ui

## Objective
> 🎨 **Design direction:** DESIGN-SYSTEM.md §7: virtualised table + dnd-kit kanban, four states, instant filters (URL-synced).

Turn calls into a pipeline: lead workspace with custom fields, tags, statuses, dynamic variables, owners, auto Hot/Warm/Cold scoring from intent + sentiment, Quick-CRM kanban.

## Step-by-step build
1. Lead workspace UI: table + kanban (dnd-kit) pipeline; custom fields, tags, statuses, owner.
2. Dynamic variables injected into agent scripts at call time.
3. Auto-scoring: derive Hot/Warm/Cold from outcome/intent/sentiment; update status post-call.
4. Quick-CRM for teams without an external CRM; status sync to connected CRMs (Day 40).
5. Tests: scoring rules, dynamic var injection, pipeline transitions, tenant scoping.

## Definition of Done
- [ ] Leads scored + managed in a pipeline; dynamic vars personalise calls; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (scoring) + B + H.**

## Commit plan
`feat(web,api): lead workspace + custom fields + auto-scoring (Day 29)` — branch `day/29-lead-workspace` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Lead intelligence live. Next: A/B testing.
