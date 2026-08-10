# PARITY 06 — Slack Connector (per-event notifications)  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- A Slack app (bot token `SLACK_BOT_TOKEN` or incoming-webhook URL) for live delivery. Build + test with a mocked Slack client; gate live send if absent.

## Context to load
- CLAUDE.md
- Day 40 integrations framework (connector interface + encrypted credential storage + event mapping) — extend it, don't fork
- Day 44 messaging (per-event notification concept)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #5

## Objective
A **Slack connector** in the existing Integrations framework: connect a workspace, pick a channel, and send **per-event notifications** (lead created, call completed, appointment booked, form submitted) with a per-event on/off matrix and a test button.

## Step-by-step build
1. `SlackConnector` implementing the Day-40 connector interface: OAuth/token storage (encrypted), channel list, `notify(event, payload)` → Slack Web API `chat.postMessage` (or incoming webhook). Gate to a no-op + "not connected" when unconfigured.
2. Event subscriptions: per-event toggle matrix stored per tenant; dispatch on the relevant domain events.
3. Web: Slack card on Integrations (connect, channel select, per-event toggles, test button, live connection status).
4. Tests: connector auth/storage (encrypted), event→message mapping, per-event toggle honoured, tenant scope, gated no-op without creds.

## Definition of Done
- [ ] Slack connect + channel select + per-event notifications + test button; encrypted creds; gated without a token; tests pass.

## Self-audit focus
Full A–K. Special attention: **C (token encrypted at rest, never logged), B (tenant scope), E (delivery failures handled).**

## Commit plan
`feat(api,web): Slack connector with per-event notifications [parity-06]` — branch `parity/06-slack-connector` → PR → CI → merge.

## Report to admin
Slack connector live. Next: PARITY-07 broadcast announcements.
