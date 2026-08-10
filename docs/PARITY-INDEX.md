# Competitor-Parity Phase — Index & Build Order

> Turns `docs/COMPETITOR-FEATURE-ANALYSIS.md` (10 net-new deltas + 5 enhancements) into day-by-day super-prompts. Goal: make VocalIQ a strict **superset** of IntelliCall AI + AgentLabs AI while keeping every VocalIQ differentiator. Each PARITY day runs the standard daily loop (`CLAUDE.md §2`): read → confirm prereqs → restate plan → build + tests → self-audit (A–K) → commit/push → PR → CI green → merge → BUILD-LOG.
>
> Build **strictly in this order** (dependencies + no-credential quick-wins first, user-favourite trio early). Each day is its own branch → PR → merge.

| # | Day file | Delta | Needs creds? | Model | Notes |
|---|----------|-------|--------------|-------|-------|
| 01 | `PARITY-01-plivo-openrouter.md` | #6 | no | Opus | Plivo telephony + OpenRouter LLM adapters (mirror Telnyx). Quick win — 3rd carrier + multi-LLM. |
| 02 | `PARITY-02-instant-dial-api.md` | #4 | no | Opus | `POST /calls/dial` one-shot endpoint (auto-creates lead). Prereq for n8n. |
| 03 | `PARITY-03-ai-form-builder.md` | #2 | no | Opus | **Mostly delivered by Day 37** (Form/FormSubmission models, typed-field validation + formula-injection-safe sanitisation, authenticated CRUD, `/dashboard/forms` UI, hosted `/f/[id]` page, gated Sheets sync). Residual: HMAC-signed webhook routing (landed in 04) + an optional in-call FORM builder node (deferred follow-up). |
| 04 | `PARITY-04-form-to-call.md` | #1 ★ | no | Opus | Form-to-Call: form submit → dial the submitter within seconds (wires the already-defined `routing.triggerAgentId` → the vetted outbound path) **+ HMAC-signed form webhooks**. User favourite; built on 02. |
| 05 | `PARITY-05-n8n-connector.md` | #3 | (n8n instance) | Opus | First-class n8n connector + ready-made workflow templates (instant-dial, form-to-call). Depends on 02+04. |
| 06 | `PARITY-06-slack-connector.md` | #5 | Slack app | Sonnet | Slack connector: per-event notifications, channel select. |
| 07 | `PARITY-07-broadcast-announcements.md` | #7 | no | Sonnet | Super-admin → platform-wide broadcast announcements (uses `Notification`). |
| 08 | `PARITY-08-promo-credits.md` | #8 | no | Opus | Promotional / bonus credits in the wallet (billing/metering-sensitive). |
| 09 | `PARITY-09-in-app-api-reference.md` | #9 | no | Sonnet | In-dashboard interactive API reference (copy-ready curl, live explorer). |
| 10 | `PARITY-10-enhancements-batch.md` | 5×🔼 | no | Opus | Per-event notification matrix, campaign queue-state UI, CSV/PDF export + trend tiles, automation-run logs, connector live-status. |
| 11 | `PARITY-11-selfhost-installer.md` | #10 | (release infra) | Opus | Self-hosted white-label installable build + "Check for Updates" version checker. Packaging — last. |

## Already covered since the analysis (2026-06-30) — no PARITY day needed
- **Phone-number purchase + pool + availability filtering** — shipped (PR #133, `/dashboard/phone-numbers`).
- **Telnyx telephony + numbers** — shipped (PR #134).
- HubSpot/Salesforce/Zendesk CRM sync, SIP trunk, RAG, recording/transcription/search, web widget, WhatsApp templated messaging, public REST API + signed webhooks, key vault, analytics, real-time translation — already in the base build (see the gap map, Part 3).

## Cross-cutting rules for every PARITY day
- **Provider-agnostic** (golden rule #2): carriers/LLMs/channels behind the router or a typed connector interface — never vendor-specific code outside `packages/provider-router` / the connector layer.
- **Tenant-scoped** (golden rule #1): every read/write via `db.withTenant` (RLS); new tables get an RLS policy + the new-table checklist.
- **Metered** (golden rule #4): any path that places a call / consumes a provider writes a `UsageRecord`.
- **Secrets** (golden rule #5): connector/provider keys encrypted at rest, Bearer/HMAC only, never logged; webhooks signature-verified.
- **Gated when no creds**: features that need admin credentials degrade to a mock/stub/QUEUED state and surface a Live/Demo badge, exactly like the number-provisioning + messaging-channel pattern.
