# DAY 46 — MCP & Tool-Server Support + Trust Context  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 19 tools.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.3
- CODING-RULES.md (security)
- TECH-STACK.md (MCP SDK)

## Objective
Connect Model Context Protocol servers + external tool servers with per-tool response timeouts and a trust-context setting (low = untrusted external, scoped/vetted; high = owner-facing, full access).

## Step-by-step build
1. MCP client: register MCP servers per tenant/agent; expose their tools to the LLM in the loop.
2. Trust context (low/high/unknown) gating tool access + output vetting; per-tool response timeout (default 30s, min 5, max 120).
3. Scope + sandbox external tool access; audit tool calls.
4. Tests: MCP tool discovery + call, trust-context gating, timeout enforcement, audit logging.

## Definition of Done
- [ ] MCP/tool servers connectable with trust context + timeouts; audited; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (trust scoping, sandbox, SSRF) + D + B.**

## Commit plan
`feat(voice,api): MCP + tool-server support + trust context (Day 46)` — branch `day/46-mcp-tool-servers` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Extensible tools, safely. Next: marketplace + automations.
