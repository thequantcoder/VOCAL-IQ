# PARITY 10 — Enhancements Batch (the 5 🔼 polish items)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. This day may be split into a few small PRs (one per enhancement) — encouraged.

## Prerequisites (admin)
- None.

## Context to load
- CLAUDE.md
- Day 40 integrations (connector status), Day 44 messaging + Day 72 email (notifications), Day 28 campaigns + Day 79 dialer (queue states), Days 14/41 analytics, Day 85 automations (`AutomationRun`)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` Part 4 "🔼 Enhance" list

## Objective
Match competitor polish on five things VocalIQ already partly has:
1. **Per-event notification matrix** — one UI to toggle each event (lead/call/appointment/form) across each channel (email/WhatsApp/Slack/webhook).
2. **Campaign queue-state monitoring** — surface pending/processing/completed/failed counts per campaign + per-campaign retry knobs.
3. **CSV/PDF export + weekly/monthly trend tiles** on analytics.
4. **Automation/flow run-logs** view (`AutomationRun`) with status + payload + retry.
5. **Per-connector live connection-status** indicators on Integrations.

## Step-by-step build
- Do each as a self-contained slice (API + web + tests), reusing existing models. Keep each behind its own commit; open one PR per slice or a small grouped PR.
1. Notification matrix: a per-tenant preferences table (event × channel) honoured by all dispatchers; settings UI.
2. Campaign queue UI: expose queue-state aggregates from the workers + retry config per campaign; dashboard tiles.
3. Analytics export: server-side CSV + PDF generation for existing reports; weekly/monthly trend tiles (reuse the zero-dep chart kit).
4. Automation run-logs: list/detail of `AutomationRun` with filters + manual retry.
5. Connector status: a `checkConnection()` on each connector → live badge on Integrations.

## Definition of Done
- [ ] All five enhancements shipped (or clearly split across PRs), tenant-scoped, tested; analytics export produces valid CSV/PDF; queue + run-logs reflect real worker state.

## Self-audit focus
Full A–K. Special attention: **B (tenant scope on every new read), E (export/queue reflect true state — no fake numbers), F (export doesn't blow the bundle; server-side generation).**

## Commit plan
`feat(api,web): parity enhancements — notif matrix, queue UI, export, run-logs, connector status [parity-10]` — branch `parity/10-enhancements` (may be several commits/PRs) → CI → merge.

## Report to admin
Polish batch done. Next: PARITY-11 self-hosted installer.
