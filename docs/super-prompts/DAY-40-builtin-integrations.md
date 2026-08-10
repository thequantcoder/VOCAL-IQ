# DAY 40 — Built-in Integrations — HubSpot/Salesforce/Zendesk/Calendars  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Sandbox accounts for the CRMs/helpdesks you want first (HubSpot easiest).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.5
- DATA-MODEL.md (Integration)

## Objective
Native connectors so calls sync to CRMs/helpdesks: lead/contact upsert, status + sentiment sync, ticket creation, calendar — via OAuth, with a clean framework others extend.

## Step-by-step build
1. Integration framework: typed connector interface, OAuth/credential storage (encrypted), event mapping.
2. Implement HubSpot (contacts/leads) + adapters/stubs for Salesforce + Zendesk (same pattern).
3. Post-call sync: upsert contact, push qualification + sentiment, create ticket where configured.
4. Tests: connector auth, upsert/sync mapping, error handling, tenant scoping.

## Definition of Done
- [ ] At least HubSpot fully syncs calls/leads; framework ready for more; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (creds encrypted) + B + G.**

## Commit plan
`feat(api,web): integrations framework + HubSpot (Day 40)` — branch `day/40-builtin-integrations` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Phase 2.5 complete. Tag v0.4-phase2_5. Next: analytics, multi-channel, polish.
