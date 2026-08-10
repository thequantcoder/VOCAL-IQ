# PARITY 01 — Plivo Telephony + OpenRouter LLM Adapters  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- None to build (adapters gate to unit-tested + inert without keys). Live use later needs `PLIVO_AUTH_ID`/`PLIVO_AUTH_TOKEN` and/or `OPENROUTER_API_KEY`.

> If a live credential is missing it is NOT a blocker here — build + unit-test with mocked HTTP and gate live use, exactly like the Telnyx adapter (PR #134).

## Context to load
- CLAUDE.md · golden rule #2 (provider-agnostic by routing)
- `packages/provider-router/src/adapters/telnyx.ts` (the pattern to mirror — fetch-based, Bearer auth, ProviderError)
- `packages/provider-router/src/index.ts` (TelephonyProvider / NumberProvisioner / LLMProvider interfaces + exports)
- `apps/api/src/numbers/numbers.service.ts` (`buildProvisioner` carrier selection)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #6

## Objective
Add **Plivo** as a 3rd telephony carrier and **OpenRouter** as a multi-model LLM provider, both behind the existing router seams — proving "adding a provider is a config change." Plivo: number provisioning (search/buy/release) + call control (dial/hangup/transfer). OpenRouter: OpenAI-compatible chat completions with model routing.

## Step-by-step build
1. `adapters/plivo.ts`: `PlivoNumberProvisioner implements NumberProvisioner` (Plivo `GET /v1/Account/{id}/PhoneNumber/` search, `POST .../Number/{number}/` buy, `DELETE .../Number/{number}/` release) + `PlivoTelephony implements TelephonyProvider` (Call API `POST /v1/Account/{id}/Call/`, hangup, transfer). Basic-auth (auth_id:auth_token). Confirm shapes against Plivo docs first (golden rule #15).
2. `adapters/openrouter.ts`: `OpenRouterLLM implements LLMProvider` — `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible), Bearer auth, maps `usage` → TokenUsage, default model configurable.
3. Export all from `index.ts`. Add `PLIVO_*` + `OPENROUTER_API_KEY` to shared env + `.env.example`.
4. Wire Plivo into `NumbersService.buildProvisioner` (after Twilio, Telnyx). Register OpenRouter in the LLM routing-defaults/factory.
5. Tests: fetch-mocked adapter tests (search/buy/release/dial/hangup/transfer for Plivo; completion + usage mapping + non-2xx for OpenRouter), mirroring `telnyx.test.ts`.

## Definition of Done
- [ ] Plivo + OpenRouter adapters implemented, exported, wired; unit tests pass; typecheck/lint green; carriers now Twilio/Telnyx/Plivo and LLM providers include OpenRouter.

## Self-audit focus
Full A–K. Special attention: **D (adapter never bills; caller meters), C (keys Bearer/Basic only, never logged), I (Twilio/Telnyx paths unchanged).**

## Commit plan
`feat(provider-router,api): Plivo telephony/number + OpenRouter LLM adapters [parity-01]` — branch `parity/01-plivo-openrouter` → PR → CI green → merge to `main`.

> 💾 **Auto-save & push:** all code in `/Users/saransh/Documents/VOCAL-IQ`; commit + push each increment to `https://github.com/thequantcoder/VOCAL-IQ`.
## Report to admin
3 carriers + multi-LLM via OpenRouter. Next: PARITY-02 instant-dial API.
