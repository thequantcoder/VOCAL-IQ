# DAY 50 — Onboarding Flows + Motion/Animation Polish Pass  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Most features exist to onboard into.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- CODING-RULES.md (#10)
- TECH-STACK.md (Framer Motion/Lottie)

## Objective
> 🎨 **Design direction:** Build the FULL DESIGN-SYSTEM.md §6 smart onboarding (goal-based first step, interactive tour, test-call-to-own-phone aha moment, progress checklist, empty-states-as-onboarding) + the §4 motion choreography pass across the whole app + meet the §7 senior-FE checklist everywhere.

First-value-fast onboarding (guided setup, checklists, tooltips, sample agents) + a polish pass adding tasteful Framer Motion/Lottie/Auto-Animate throughout, respecting reduced-motion + performance.

## Step-by-step build
1. Onboarding: guided checklist (create agent -> connect number -> place test call -> see results), sample agents, tooltips, empty-state CTAs.
2. Motion pass: page transitions, micro-interactions, list animations, builder canvas niceties, dashboard chart reveals; Lottie for key empty/success states.
3. Respect prefers-reduced-motion; no jank/perf regression.
4. E2E: onboarding completion path; reduced-motion respected.

## Definition of Done
- [ ] Polished onboarding + delightful performant motion; reduced-motion honoured; E2E passes.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **H (UI/motion/perf) + A.**

## Commit plan
`feat(web): onboarding + motion polish (Day 50)` — branch `day/50-onboarding-polish` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Phase 3 complete. Tag v0.5-phase3. Next: white-label & reseller.
