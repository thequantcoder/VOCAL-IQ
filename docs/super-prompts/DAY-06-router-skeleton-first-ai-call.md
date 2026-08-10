# DAY 06 — Provider-Router Skeleton + First Proven AI Call (Text)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- OPENAI_API_KEY and/or ANTHROPIC_API_KEY.
- GEMINI_API_KEY optional.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md (golden rules #2,#3,#4)
- ARCHITECTURE.md (router contract)
- TECH-STACK.md (provider-router)
- DATA-MODEL.md (ProviderCredential, UsageRecord)

## Objective
Stand up packages/provider-router with the LLM interface, OpenAI+Anthropic adapters, Router selection (tenant->plan->cost/latency->fallback), BYOK vs managed key resolution, UsageRecord emission. Prove with a real text completion that records cost.

## Step-by-step build
1. Interfaces: LLMProvider {complete,stream,embed}; RouteRequest; UsageMeter emitting UsageRecord.
2. OpenAI + Anthropic LLM adapters (stream + non-stream + embeddings).
3. Router.selectLLM: resolve BYOK (tenant ProviderCredential) vs platform key (PlatformApiKeyPool); choose model by tenant policy -> plan -> cost/latency -> availability fallback.
4. Encrypted key resolution (envelope decrypt in memory; never log).
5. Emit UsageRecord on every call (units + costUsd via price table; flag byok so BYOK isn't billed).
6. api endpoint POST /agents/:id/test-complete (BUILDER+) runs a completion through the router for current tenant.
7. Tests: adapter contract (mocked), router selection branches, BYOK vs managed billing, fallback on simulated error, UsageRecord shape.

## Definition of Done
- [ ] Router returns working LLM client per tenant; both adapters pass contract tests.
- [ ] Selection + fallback + BYOK/managed tested.
- [ ] Every call emits correct UsageRecord (BYOK not billed).
- [ ] Live endpoint returns real completion + cost.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (cost/router) + C (key handling) + B. No provider-specific code outside the package; keys never logged.**

## Commit plan
`feat(router): LLM abstraction, OpenAI+Anthropic, routing, usage (Day 6)` — branch `day/06-router-skeleton-first-ai-call` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Phase 0 done. Next: voice loop. Ensure LiveKit+Deepgram+ElevenLabs+Twilio keys ready.
