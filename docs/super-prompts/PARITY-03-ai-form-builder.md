# PARITY 03 — AI Form Builder (in-flow dynamic forms + routing)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- None to build. Google-Sheets sync of submissions needs `GOOGLE_OAUTH_*` (Sheets scope) — gated if absent (reuse the Day 37 gating).

## Context to load
- CLAUDE.md
- Day 37 sheets/forms (existing form + Sheets sync) and Days 18–21 node builder (node types, compiler, collect node)
- Schema for forms/collected data; `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #2
- `packages/shared` zod patterns

## Objective
A first-class **AI Form Builder**: define dynamic forms (typed fields + validation), render/collect them (standalone hosted form **and** an in-flow "Form" node the agent can drive mid-call), route submissions to endpoints/webhooks, and sync to Google Sheets with **auto header-row creation**.

## Step-by-step build
1. Data model: `Form` (tenantId, name, fields[] JSON schema, routing config) + `FormSubmission` (tenantId, formId, data JSON, source, contactId?). RLS on both (new-table checklist).
2. Shared zod: field types (text/number/email/phone/select/date/bool), per-field validation rules, `formSchema` + `formSubmissionSchema`.
3. API: CRUD for forms + `POST /forms/:id/submit` (validate against the form's field rules) → store submission → route (webhook/endpoint) → optional Sheets append (auto-create header row on first append). All tenant-scoped.
4. Builder: a "Form" node type (references a `Form`) + compiler support so a flow can collect a form mid-call. Standalone hosted form page (`/f/:id`) for web capture.
5. Web: form builder UI (add/reorder fields, set validation, routing target) under the dashboard.
6. Tests: field validation (accept/reject), submission storage + tenant scope, routing dispatch, Sheets auto-header (mocked), builder-node compile.

## Definition of Done
- [ ] Forms can be defined, rendered (hosted + in-flow node), validated, submitted, routed, and Sheets-synced (gated); tenant-scoped; tests pass.

## Self-audit focus
Full A–K. Special attention: **B (RLS on Form/FormSubmission), A (validation correctness), E/G (bad submissions rejected cleanly), H (accessible form UI).**

## Commit plan
`feat(api,web,db): AI Form Builder + in-flow form node + routing [parity-03]` — branch `parity/03-ai-form-builder` → PR → CI → merge.

## Report to admin
AI Form Builder live (foundational for Form-to-Call). Next: PARITY-04.
