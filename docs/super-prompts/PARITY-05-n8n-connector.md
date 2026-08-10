# PARITY 05 — n8n First-Class Connector + Workflow Templates  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- None to build. To exercise end-to-end you need an n8n instance (self-host or cloud) — not required for the code + tests.

## Context to load
- CLAUDE.md
- **PARITY-02** (instant-dial) + **PARITY-04** (form-to-call) — the templates call these
- Days 47/85 automations + public API (API keys, signed webhooks)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #3 (400+ apps via n8n + importable templates)

## Objective
Make VocalIQ a first-class n8n citizen: a documented set of **trigger + action webhooks** for n8n's generic HTTP/webhook nodes, plus **ready-made importable workflow templates** (instant-dial, form-to-call) so users get 400+ app reach without us building each integration.

## Step-by-step build
1. Stable, documented **action endpoints** for n8n to call (reuse PARITY-02 `/calls/dial`, form submit, lead upsert) + **trigger webhooks** (call-completed, lead-created, form-submitted) with signed payloads (HMAC + timestamp, reuse the webhook-signing pattern).
2. An **n8n connection** concept in Integrations (API key + event subscriptions + live status), matching the connector framework.
3. Ship **importable n8n workflow JSON templates** in-repo (`docs/n8n-templates/`): (a) instant-dial (HTTP → `/calls/dial`), (b) form-to-call (webhook trigger → dial), (c) call-completed → CRM/Sheet. Downloadable from the dashboard.
4. Web: an "n8n" panel (API key, webhook URLs, template downloads, connection status).
5. Tests: signed trigger dispatch (payload + signature + timestamp), action auth, template JSON validity, tenant scope.

## Definition of Done
- [ ] n8n connector (triggers + actions + signed webhooks) + 3 importable templates shipped and downloadable; tests pass.

## Self-audit focus
Full A–K. Special attention: **C (HMAC + replay/timestamp on webhooks), B (tenant scope), E (delivery/retry + failure logging).**

## Commit plan
`feat(api,web): n8n connector + importable workflow templates [parity-05]` — branch `parity/05-n8n-connector` → PR → CI → merge.

## Report to admin
n8n + templates live (400+ app reach). Next: PARITY-06 Slack.
