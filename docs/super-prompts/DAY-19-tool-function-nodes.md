# DAY 19 — Tool Node + Function Calling + Webhook Node  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 18; an HTTP endpoint to test webhooks (mock ok).

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md
- CODING-RULES.md (security)
- DATA-MODEL.md (Webhook)

## Objective
Let agents act mid-call: a Tool node defining typed functions the LLM can call (executed safely, results fed back) + a generic Webhook/REST node.

## Step-by-step build
1. Tool definition UI: name, typed params (JSON schema), endpoint/handler, auth; register as LLM tools in the loop.
2. Execution engine: validate args, call with timeout + retry, sandbox egress, feed result back; backchannel filler during execution.
3. Webhook node: signed outbound request with payload mapping.
4. Security: per-tool trust scope (prep MCP Day 46), SSRF protection (deny internal IPs), encrypted secrets.
5. Tests: arg validation, timeout/retry, SSRF protection, result-to-LLM round trip, webhook signing.

## Definition of Done
- [ ] Agents call typed tools + webhooks mid-call with results integrated; SSRF-safe; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (SSRF, secrets, validation) + D (tool latency metered) + A.**

## Commit plan
`feat(voice,web): tool/function-calling + webhook nodes (Day 19)` — branch `day/19-tool-function-nodes` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Agents can act. Next: RAG knowledge node.
