# DAY 45 — Multimodality — One Agent: Voice + Text + Chat  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 9, 16, 44.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.3
- ARCHITECTURE.md

## Objective
Define an agent once and deploy across voice calls, web chat, and messaging simultaneously, keeping behaviour consistent and halving build effort.

## Step-by-step build
1. Abstract the agent runtime so the same compiled flow drives voice + text/chat; channel-aware node behaviour.
2. Web chat widget (text) reusing the agent; messaging (WhatsApp) as a text channel into the same runtime.
3. Consistent memory/context across channels for a contact.
4. Tests: same agent answers consistently across voice/text/chat; channel-specific rendering; tenant scoping.

## Definition of Done
- [ ] One agent definition serves voice+text+chat consistently; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (consistency) + B + D.**

## Commit plan
`feat(voice,web): multimodal agents (voice+text+chat) (Day 45)` — branch `day/45-multimodality` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
ElevenLabs-2.0-parity multimodality. Next: MCP + tool servers.
