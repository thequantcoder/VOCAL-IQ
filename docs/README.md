# VocalIQ Build Kit

This folder is the complete instruction set for building **VocalIQ** (the Agentic Voice AI SaaS from the v1.2 blueprint) with **Claude Code** (Opus + Sonnet). Drop the whole folder into your project, open it in VS Code with Claude Code installed, and follow the daily loop.

## What's here

| File | Read when |
|------|-----------|
| `00-START-HERE.md` | **First.** Orientation + first-session checklist. |
| `CLAUDE.md` | Auto-read by Claude Code every session — the master rules (keep at repo root too). |
| `PREREQUISITES.md` | Before each phase — every account/API key/decision the admin must provide. |
| `TECH-STACK.md` | Reference — exact stack + versions. |
| `ARCHITECTURE.md` | Reference — system design + repo layout. |
| `DATA-MODEL.md` | Reference — multi-tenant schema + RLS. |
| `CODING-RULES.md` | Reference — coding standards + quality bar. |
| `CODE-PATTERNS.md` | Reference — canonical copy-me implementation patterns (use every day). |
| `SELF-AUDIT-PROTOCOL.md` | Run after every day — mandatory audit. |
| `GIT-WORKFLOW.md` | Reference — commits, branches, push discipline. |
| `PROMPT-INDEX.md` | The full 95-day map (phases 0–5). |
| `super-prompts/DAY-00…94-*.md` | The day-by-day build prompts (95 days: core + Agent Desk + i18n + core-tier + Phase 6 advanced). |
| `BUILD-LOG.md` | Claude appends to this every day. |

## How to start

1. Read `00-START-HERE.md`.
2. Create the empty GitHub repo + local folder; gather Group A–B credentials from `PREREQUISITES.md`.
3. In Claude Code: `Read CLAUDE.md, then execute super-prompts/DAY-00-scaffold.md following the daily loop.` The path Give it the repo URL + local path when asked. repo are already wired into the kit.
4. Continue day by day, switching the model per each day's header (`🧠 OPUS` / `⚡ SONNET`).

## The non-negotiables (also in CLAUDE.md)

1. Multi-tenancy on every row/query/route (RLS + guards).
2. All provider calls go through the Provider Router; every call meters cost.
3. BYOK and managed both work.
4. Security is not a phase (encrypted keys, verified webhooks, validated inputs, RBAC).
5. Never mark a day done without passing tests **and** the self-audit.

## Project location & Git (already wired in)
- **Local code path:** `/Users/saransh/Documents/VOCAL-IQ` — all code is saved here.
- **GitHub remote:** `https://github.com/thequantcoder/VOCAL-IQ` — Claude auto-commits + pushes after every change.

These are fixed in `CLAUDE.md §0.1` and `GIT-WORKFLOW.md`; you don't need to provide them — just make sure `git`/GitHub is authenticated on your Mac so pushes succeed.

The product spec this is built from is `VocalIQ-Voice-AI-SaaS-Blueprint-v1.2.docx`.
