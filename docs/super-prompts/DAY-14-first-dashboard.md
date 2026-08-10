# DAY 14 — First Dashboard — Create Agent, Place Call, See Transcript+Cost  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 6-13; no new credentials.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- packages/ui tokens
- CODING-RULES.md (#10 UI)
- DATA-MODEL.md

## Objective
> 🎨 **Design direction:** Apply DESIGN-SYSTEM.md §5c (live-call view with the signature waveform) + §7 senior-FE floor (four states, skeletons, a11y AA, responsive). This is the first screen anyone sees — make it feel premium.

Ship the first end-to-end UI: create a prompt-based agent, assign a number, place a test call, review transcript/recording/disposition/cost.

## Step-by-step build
1. Dashboard shell: nav, tenant switcher, dark mode, responsive (packages/ui). **Add React error boundaries** at the app shell + route level (friendly recover/retry fallback, Sentry-reported — never a white screen) per `DESIGN-SYSTEM.md §7 Resilience`.
2. Agent create/edit form (name, persona/system prompt, voice, language, turn timeout).
3. Number assignment UI; 'Place test call' (outbound to a number, or web-call).
4. Calls list (TanStack Table, cursor pagination) + call detail: transcript synced to wavesurfer, disposition, cost breakdown.
5. Loading/empty/error states; optimistic where safe.
6. E2E (Playwright): sign up -> create agent -> place test call (mocked provider) -> see transcript + cost.

## Definition of Done
- [ ] User creates agent, places test call, reviews transcript+recording+cost.
- [ ] Responsive + dark mode + a11y; async states handled.
- [ ] E2E passes.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **H (UI) + A (journey) + B (only own data).**

## Commit plan
`feat(web): first dashboard — agent, call, transcript, cost (Day 14)` — branch `day/14-first-dashboard` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
First demoable product. Next: billing.
