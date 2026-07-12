# PARITY 09 — In-Dashboard Interactive API Reference  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- None.

## Context to load
- CLAUDE.md
- Day 48 public API/SDK (the documented endpoints, API-key auth) + PARITY-02/04/05 (new endpoints to include)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #9 (copy-ready curl, live explorer)

## Objective
An **in-dashboard API reference**: every public endpoint documented with method/path/params/response, **copy-ready curl** pre-filled with the tenant's base URL + a chosen API key, and a **live "Try it"** that calls the endpoint from the browser and shows the response — so developers integrate without leaving the app.

## Step-by-step build
1. Source of truth: generate an OpenAPI/JSON spec of the public API from the existing zod contracts (or a maintained spec module) so the reference never drifts from the code.
2. Web: an `/dashboard/developers/api` page rendering the spec — grouped endpoints, params, schemas, copy-curl (base URL + selected key injected), and a guarded "Try it" (rate-limited, key-scoped) that executes against the real API.
3. Include the new PARITY endpoints (`/calls/dial`, form submit, webhooks).
4. Tests: spec generation stays in sync with contracts (a test that fails if an endpoint lacks a spec entry), curl builder output, "Try it" auth/rate-limit guard, tenant scope.

## Definition of Done
- [ ] Interactive API reference renders all public endpoints with copy-curl + guarded live "Try it"; spec stays in sync with code; tests pass.

## Self-audit focus
Full A–K. Special attention: **C (never expose secrets; keys chosen by the user, not embedded in shipped HTML), H (accessible, responsive explorer), A (spec-in-sync test).**

## Commit plan
`feat(web,api): in-dashboard interactive API reference [parity-09]` — branch `parity/09-api-reference` → PR → CI → merge.

## Report to admin
Interactive API reference live. Next: PARITY-10 enhancements batch.
