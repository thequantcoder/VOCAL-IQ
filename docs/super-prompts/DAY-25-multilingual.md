# DAY 25 — Multilingual + Auto Language Detection  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- TTS/STT providers for target languages; confirm language list.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md
- DATA-MODEL.md (Agent.languages)
- Day 9 loop

## Objective
Support many languages per agent with automatic mid-call detection + per-language voice/pronunciation config.

## Step-by-step build
1. Per-agent language set + default; pronunciation dictionary for names/brands/jargon.
2. Auto-detect caller language mid-call + switch TTS voice + LLM behaviour.
3. Route STT/TTS by language (provider strengths) via router.
4. UI for language config + per-language voice.
5. Tests: detection + switch, per-language routing, pronunciation overrides.

## Definition of Done
- [ ] Agents converse in multiple languages, switching automatically; per-language voices; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (detection/switch) + D (routing cost) + F.**

## Commit plan
`feat(voice,web): multilingual + auto language detection (Day 25)` — branch `day/25-multilingual` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Global-ready. Next: voice library + cloning.
