# DAY 41 — Real-Time + Historical Analytics Dashboards (Timescale)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 13 cost + Timescale; data from prior calls.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- Blueprint §3.7
- DATA-MODEL.md
- TECH-STACK.md (Recharts/visx)

## Objective
> 🎨 **Design direction:** DESIGN-SYSTEM.md §5d: calm data-dense dashboards, mono numbers, charts draw-in once, real-time tiles pulse cyan, bespoke visx voice viz.

Operator analytics: live (concurrency, minutes, spend, success) + historical (outcomes, sentiment trends, talk/listen, interruptions, drop-off, intent distribution, cost) with fast Timescale aggregations.

## Step-by-step build
1. Real-time dashboard: live calls, concurrency, minutes, success rate, spend (Socket.IO + Timescale).
2. Historical: outcomes, sentiment trends, talk/listen ratio, interruptions, drop-off, intent distribution, cost by agent/campaign/day.
3. Charts (Recharts + visx for bespoke voice viz); filters by date/agent/campaign; cursor-paginated drill-downs. **Add infra/aggregate-spend monitoring + budget alerts** (super-admin alerted when daily/monthly spend crosses thresholds; per-tenant spend anomaly flag) — distinct from per-call cost attribution.
4. Tests: aggregation correctness, real-time updates, filters, performance on large ranges.

## Definition of Done
- [ ] Live + historical analytics fast + accurate; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **F (query perf) + A (metrics) + B + H.**

## Commit plan
`feat(web,api): real-time + historical analytics (Day 41)` — branch `day/41-analytics-dashboards` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Insight layer live. Next: transcript search.
