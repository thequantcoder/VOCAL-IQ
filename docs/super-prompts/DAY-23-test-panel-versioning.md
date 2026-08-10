# DAY 23 — Live Test Panel + Versioning + Rollback  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 22.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- DATA-MODEL.md (FlowVersion)
- packages/ui

## Objective
> 🎨 **Design direction:** DESIGN-SYSTEM.md §5b/§5c: active-node glow pulse + live transcript stream (mono face, auto-scroll, current-word highlight).

Let builders talk to an agent in-browser while building, watch the active node highlight live, manage versions with one-click rollback.

## Step-by-step build
1. Test panel: in-canvas voice/text session (reuse web-call) highlighting the active node live + token/cost.
2. Version history UI: list FlowVersions, diff summary, publish, instant rollback.
3. Draft vs published separation; safe publish (compiles first).
4. Tests: active-node highlighting events, publish/rollback, draft isolation.

## Definition of Done
- [ ] Builders test live with active-node view; versioning + rollback; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **H + A + B.**

## Commit plan
`feat(web): live test panel + flow versioning/rollback (Day 23)` — branch `day/23-test-panel-versioning` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Builder a joy to use. Next: persona studio + templates.
