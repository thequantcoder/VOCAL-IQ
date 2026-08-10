# PARITY 04 — Form-to-Call Automation ★ (form submit → AI dials in seconds)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. **User-favourite feature — build it well.**

## Prerequisites (admin)
- None to build. Live dialing needs a configured carrier (else the triggered call is QUEUED).

## Context to load
- CLAUDE.md
- **PARITY-02** (instant-dial `POST /calls/dial`) and **PARITY-03** (Form Builder + `FormSubmission`) — this feature composes them
- Days 47/85 automations + webhooks (trigger/action model, `AutomationRun`)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #1 (the owner's favourite)

## Objective
Wire a **Form-to-Call trigger**: when a form is submitted (hosted form, public webhook, or n8n), create/dedupe a lead from the submission and **dispatch an outbound AI call within seconds** — configurable per form (which agent, which from-number, delay, business-hours guard, conditions).

## Step-by-step build
1. Extend `Form` routing (PARITY-03) with an optional **"call" action**: `{ agentId, fromNumberId?, delaySeconds?, conditions?, businessHours? }`.
2. On `FormSubmission` create → if a call action is configured → map fields to lead → call the PARITY-02 instant-dial service (reuse, don't duplicate) → record an `AutomationRun` (trigger=form, action=dial, status, callId/leadId).
3. Also expose a generic inbound webhook `POST /automations/form-to-call/:formId` so external forms / n8n can trigger the same path (signature/secret verified).
4. Guards: business-hours + per-form rate limit + abuse checks + plan concurrency; respect delay (enqueue).
5. Web: a "Form-to-Call" config panel on the form + an automation-run log for it.
6. Tests: submit→dial happy path (mock carrier → QUEUED), dedupe, condition/business-hours skip, delay enqueue, `AutomationRun` recorded, tenant scope.

## Definition of Done
- [ ] A form submission (UI, webhook, or n8n) reliably creates a lead + dispatches/queues an AI call, configurable + guarded + logged; tenant-scoped + metered; tests pass.

## Self-audit focus
Full A–K. Special attention: **A (end-to-end trigger correctness), D (metered), G (business-hours + rate-limit + abuse guards), B (tenant scope across the whole chain).**

## Commit plan
`feat(api,web): Form-to-Call automation (submit → AI dial) [parity-04]` — branch `parity/04-form-to-call` → PR → CI → merge.

## Report to admin
The flagship parity feature (Form-to-Call) is live. Next: PARITY-05 n8n.
