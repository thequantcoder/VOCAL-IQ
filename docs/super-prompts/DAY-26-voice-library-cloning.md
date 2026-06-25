# DAY 26 — Voice Library + Per-Agent Voice + Cloning (Gated)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- ELEVENLABS_API_KEY (cloning-capable plan); consent process agreed.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md (Voice)
- CODING-RULES.md (consent)
- Blueprint §3.3

## Objective
A browsable voice library (public presets + tenant private/cloned) with filters, per-agent assignment, tuning sliders, and gated cloning behind mandatory consent + approval.

## Step-by-step build
1. Voice library UI: filter by language/gender/age/accent/style; preview; assign default + fallback per agent.
2. Voice settings: stability, similarity, pace, pitch, style sliders.
3. Cloning flow: upload consented samples -> mandatory consent capture + approval gate -> create private voice; store consentRef; block use until approved.
4. Tests: assignment, settings persistence, cloning gated (cannot use unapproved), consent stored.

## Definition of Done
- [ ] Voice library + per-agent config + gated cloning; tests pass; unapproved clones unusable.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (consent gate) + B (private voices scoped) + A.**

## Commit plan
`feat(web,voice): voice library + per-agent voice + gated cloning (Day 26)` — branch `day/26-voice-library-cloning` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Voices managed. Next (heavy): multi-agent Squads.
