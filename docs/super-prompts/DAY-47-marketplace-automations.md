# DAY 47 — Integrations Marketplace + Cross-Channel Automations  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 40 integration framework.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.4
- DATA-MODEL.md (Integration)

## Objective
A catalogue of one-click native connectors (CRMs, helpdesks, calendars, Cal.com, Zapier/Make) + cross-channel automations treating a call as one step in a larger flow (call -> email -> CRM -> task).

## Step-by-step build
1. Marketplace UI: browse/enable connectors; per-connector config; status.
2. Cross-channel automation builder: triggers (call ended, disposition, lead status) -> actions (email/SMS/WhatsApp, CRM update, ticket, webhook, task).
3. Add connectors atop the Day 40 framework; Zapier/Make + Cal.com.
4. Tests: enable/configure connector, automation trigger->action chains, tenant scoping.

## Definition of Done
- [ ] Marketplace + multi-step cross-channel automations; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (creds) + B + A.**

## Commit plan
`feat(web,api): integrations marketplace + cross-channel automations (Day 47)` — branch `day/47-marketplace-automations` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Lindy-style orchestration. Next: public API + SDKs.
