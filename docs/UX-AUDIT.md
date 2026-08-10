# UX Audit — Frontend Inventory & Elevation Opportunities (UX-00)

> A snapshot of the current frontend (71 routes) with the motion / color / infographic / a11y gaps each
> screen has, and where it fits in the UI/UX Elevation program (`UI-UX-ELEVATION-PLAN.md`). This is the
> baseline the later UX-Days work against. Priorities: **P0** = high-traffic / high-visibility (do
> first), **P1** = important, **P2** = long-tail.

## Baseline (what exists today)

- **Motion:** essentially none beyond one CSS waveform keyframe + a few `vq-reveal/stagger/lift` classes.
  No animation library. No page transitions. No CTA/state micro-interactions.
- **Components:** `packages/ui` = 4 primitives (Button, Card, Input, Waveform). Everything else is
  composed inline with Tailwind → inconsistent spacing/states.
- **Color:** 2 brand colors (violet primary, cyan accent) + semantic states. Flat surfaces. Numbers are
  plain text (few charts; some Recharts usage in analytics). Little infographic density.
- **Theming:** reseller white-label only (2 colors → CSS vars). No per-user theme, no theme presets,
  only light/dark toggle.
- **A11y:** generally decent (labels, focus rings in places) but unaudited; reduced-motion only on the
  waveform + hero.
- **Onboarding:** a basic `OnboardingChecklist` stub on the overview.

## Route inventory & audit (grouped by area)

| Area / routes | Current state | Motion gap | Color / infographic opp. | A11y | Priority | UX-Day |
|---|---|---|---|---|---|---|
| **Overview** `/dashboard` | Hero waveform + 3 stat cards + checklist | No entrance/stagger, static stats | KPI count-up, sparklines, live-activity feed, sentiment color | Landmarks ok | **P0** | 10 |
| **Agents** `/agents`, `/new`, `/templates`, `/[id]/{builder,chat,tests,memory,settings,learning}` | Card list + per-agent sub-pages; builder = React Flow | No card hover/lift, no sub-tab indicator, no builder motion | Agent avatars, status/channel chips, usage sparkline, builder node polish | Sub-tab nav unlabeled | **P0** | 05,07,10 |
| **Calls** `/calls`, `/calls/[id]` | Table + detail | No row expand motion, no transition to detail | Sentiment/outcome color, transcript stream, conversation viz, cost mini-chart | Table semantics | **P0** | 04,06,10 |
| **Agent Desk** `/desk` | Live operator view | No live-state motion | VoiceOrb + live waveform + transcript stream + presence | Live-region announce | **P0** | 04,05 |
| **Live Co-Pilot** `/copilot` | Session workspace | No live suggestion motion | Conversation viz, suggestion cards, battlecard reveal | — | P1 | 04,05 |
| **Analytics** `/analytics` | Some charts | Charts static/unthemed | Full viz kit: trend area, outcome donut, sentiment ribbon, heatmap, KPI cards | Chart alt-text | **P0** | 09,10 |
| **Analytics family** `/benchmarking`, `/exports`, `/revenue`, `/intel`, `/latency`, `/qa`, `/sentiment`, `/search` | Data tables / panels | No entrances, static numbers | Themed charts, gauges, sparklines, deltas | Varies | P1 | 09,10 |
| **Wallet / billing** `/wallet`, `/payments`, `/outcomes`, `/callbacks` | Balance + advanced-tier grid | No count-up, no meter motion | Spend sparkline, usage meters, animated balance | — | P1 | 08,09,10 |
| **Voices & avatars** `/voices`, `/voice-emotion`, `/avatars`, `/models` | Lists + forms | No preview motion | Voice preview waveform, avatar presence, emotion viz | Media controls | P1 | 04,05 |
| **Build tools** `/squads`, `/campaigns`, `/flows` (builder), `/forms`, `/experiments`, `/automations`, `/workflows`, `/workflows/[id]` | Builders + lists | No canvas/flow motion, no list entrances | Node/edge polish, run-status viz, colorful state chips | Canvas a11y | P1 | 05,06,07 |
| **Channels & telephony** `/messaging`, `/sip`, `/reputation`, `/integrations`, `/mcp`, `/appointments`, `/leads` | Forms + lists | No state motion | Channel color chips, health gauges, pipeline viz (leads), calendar | Forms labeled | P1 | 07,08,09 |
| **Marketplace / developers** `/marketplace`, `/apps`, `/developers`, `/support` | Cards / keys | No card motion | Category color, install/celebrate motion, key reveal | — | P2 | 03,08 |
| **Settings** `/settings/{translation,biometrics,battlecards,compliance,sso}`, `/branding` | Forms | No form motion | Consistent form kit, section reveals, **new: Appearance/theme** | Form errors motion | **P0** (theme) | 12,13 |
| **Reseller** `/reseller`, `/reseller/dashboard` | Sub-tenant list + revenue | No motion | Margin gauge, sub-tenant mix donut, health sparklines, denser | Table semantics | **P0** | 09,11 |
| **Super-admin** `/admin`, `/admin/{vault,key-pool,governance,plans,fraud}` | Ops tables/forms | No motion | Platform-health KPIs, tenants table, plan-builder preview, denser | Sensitive-data care | **P0** | 09,11 |
| **Auth** `/sign-in`, `/sign-up` | Card form + dev-login | Minimal | Ambient bg, brand motion, voice motif | Focus order | P1 | 05,14 |
| **Public** `/` (landing), `/privacy`, `/terms`, `/status`, `/f/[id]` (form), `/widget/[agentId]` | Landing done (Day 95); others plain | Landing good; widget/forms static | Widget = live waveform/orb; forms = friendly motion | Public a11y | P1 | 04,05 |
| **Shell** `dashboard-shell` (nav, header) | ~50-item flat nav, header | No active-indicator motion, no transitions | Grouped nav, sliding indicator, ⌘K, mobile drawer | Nav landmarks | **P0** | 06,07 |
| **Kitchen-sink** `/dashboard/kitchen` | New (this day) | — | Grows into the full gallery | dev-only | — | 00+ |

## Cross-cutting gaps (fix program-wide)

1. **No motion engine** → UX-01 (framer-motion + LazyMotion + primitives, reduced-motion first).
2. **Thin token system** → UX-02 (full color scales, elevation, density, viz palette).
3. **Tiny component kit** → UX-03 (~18 primitives) so screens stop re-inventing spacing/states.
4. **No voice-native motion** → UX-04/05 (waveform states, VoiceOrb, ConversationViz, transcript,
   agent avatars) — the product's identity.
5. **Flat data** → UX-09 (animated infographics) applied across analytics/overview/reseller/admin.
6. **No per-user theming** → UX-12/13 (presets + custom + live studio).
7. **Basic onboarding** → UX-14 (5-step wizard + 2/3-step micro-flows + coachmark tour).
8. **Unaudited a11y / no CWV budget** → UX-16 gate.

## First-wave recommendation (max impact)

After foundations (00→03): do **04–05 (voice identity)** and **09–10 (viz + user overview)** early — those
are the most visible "wow" per day and re-skin the highest-traffic screens.
