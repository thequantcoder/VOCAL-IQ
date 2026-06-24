# DAY 24 — Prompt & Persona Studio + Templates Marketplace  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 23.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- Blueprint §3.4
- DATA-MODEL.md (Agent.persona)

## Objective
> 🎨 **Design direction:** Templates marketplace + studio follow DESIGN-SYSTEM.md; beautiful template cards, preview, clone-in-one-tap.

A guided studio for prompts/persona/guardrails with token+cost preview, plus a templates marketplace (sales, support, scheduling, survey, healthcare-style) users clone.

## Step-by-step build
1. Persona studio: structured editor (role, tone, guardrails, banned words), token + cost preview, prompt lint.
2. Template library: seed category templates (prompts/settings/flows); clone-to-agent one click; multi-language variants.
3. Save tenant's own agents as private templates.
4. Tests: clone correctness, token/cost preview, banned-words persisted.

## Definition of Done
- [ ] Studio + cloneable templates; agents creatable in minutes; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A + H + B (templates don't leak cross-tenant except public presets).**

## Commit plan
`feat(web): persona studio + agent templates marketplace (Day 24)` — branch `day/24-persona-studio-templates` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Onboarding friction down. Next: multilingual + detection.
