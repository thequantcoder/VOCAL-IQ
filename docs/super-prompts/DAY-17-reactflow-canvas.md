# DAY 17 — React Flow Canvas Foundation + Node/Edge Model  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- No new credentials. Day 16 complete.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- DATA-MODEL.md (Flow, FlowVersion)
- TECH-STACK.md (React Flow)
- CODING-RULES.md (#10)

## Objective
> 🎨 **Design direction:** This is the product's soul — DESIGN-SYSTEM.md §5b gets the MOST polish budget: spatial dark canvas, typed node colors, active-node cyan glow, animated edges, cmd-K, springy drag-to-connect.

Build the builder foundation on React Flow: canvas with custom node/edge types, pan/zoom, add/connect/delete, config drawer, autosave to FlowVersion, typed graph model in shared.

## Step-by-step build
1. Graph schema in packages/shared (NodeType enum, node config types, edge conditions) + Zod.
2. React Flow canvas: custom node renderers, edge types, mini-map, controls, snapping, keyboard delete.
3. Node config drawer driven by node type; Zustand canvas state.
4. Autosave graph -> FlowVersion (debounced); load/restore; dirty indicator.
5. Validation: disconnected nodes, missing start/end, invalid edges; inline errors.
6. Tests: graph serialise/deserialise round-trip, validation, autosave, a11y of controls.

## Definition of Done
- [ ] Canvas add/connect/delete/config + autosave + validation.
- [ ] Graph model typed + validated; round-trips to FlowVersion.
- [ ] Responsive + keyboard accessible; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **A (graph integrity) + H + J.**

## Commit plan
`feat(web,shared): React Flow builder foundation + graph model (Day 17)` — branch `day/17-reactflow-canvas` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Builder canvas live. Next: node types.
