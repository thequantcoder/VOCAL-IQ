# VocalIQ — UI/UX Elevation Program (Frontend Motion, Theming & Delight)

> A day-by-day super-prompt program to take the VocalIQ frontend from "clean and functional" to
> **category-leading, animated, colorful, voice-native, and deeply customizable** — across the user,
> reseller, and super-admin dashboards + the public surfaces.
>
> **Status:** PLAN ONLY. Nothing here is built yet. Execute one UX-Day at a time, after admin
> confirmation, using the same daily loop + git discipline as `CLAUDE.md §2` (branch → build with
> tests → self-audit A–K → PR → CI green → merge → log). Each UX-Day below is a complete super-prompt.
>
> **Where this fits:** the 96-day product build is ~done (v1.2.0). This is a *frontend excellence*
> layer on top of a working app — so the prime directive is **never break a working feature** while we
> make everything feel alive.

---

## 0. North Star, Principles & Non-Negotiables

**Thesis (extends DESIGN-SYSTEM §0 — "sound made visible").** VocalIQ is a *voice* product; the UI
should feel like it can **hear and speak**. The signature motif is the living violet→cyan waveform.
Every motion decision should reinforce "a calm, intelligent voice agent at work" — not generic SaaS
flourish. Motion is **meaning**, not decoration.

**The five principles**

1. **Voice-native.** The waveform, the "listening → thinking → speaking" states, and conversation
   turn-taking are first-class visual primitives — reused everywhere (hero, live call, loaders,
   agent avatars, empty states).
2. **Calm by default, vivid on intent.** Quiet neutral surfaces; **cyan = live/real-time**; color and
   motion *escalate* around meaningful moments (a call connects, an agent publishes, a lead converts).
   "More colorful" = richer data-viz + tasteful gradient accents + optional Vivid theme — **not** noise.
3. **Motion with a purpose + a budget.** Enter/exit, state changes, spatial continuity (shared-element
   transitions), and feedback (press/success). Everything **honours `prefers-reduced-motion`** and a
   **motion-level user setting** (Full / Reduced / Off). Target 60fps; transform/opacity only.
4. **Yours to theme.** A real **theme engine**: platform default → reseller white-label → **per-user
   theme** (multiple presets + custom primary/secondary/accent + radius/density/motion/font). Live
   preview. Persisted per user.
5. **Delight that respects the user.** Onboarding that teaches, empty states that upsell, success
   moments that celebrate (confetti/bursts — sparingly), a command palette (⌘K), and pixel-perfect,
   AA-accessible, keyboard-complete screens.

**Global constraints (apply to EVERY UX-Day — part of every Definition of Done)**

- ♿ **Accessibility AA:** semantic landmarks, focus-visible rings, ARIA, keyboard-complete, reduced-
  motion parity, contrast ≥ 4.5:1 (text) in **every** theme (light + dark + presets).
- ⚡ **Performance:** `LazyMotion` + code-split heavy visuals; animate only `transform`/`opacity`;
  no layout thrash; lazy-load charts/canvas; keep the landing static/SSG. CWV budget: LCP < 2.5s,
  INP < 200ms, CLS < 0.02 on the dashboard shell.
- 🧩 **No regressions:** the app already works (94 build-days). Additive changes; wrap new motion in
  primitives so a global "off" switch reverts cleanly; every touched page still passes typecheck/
  lint/build. Reuse existing tokens/components; extend, don't fork.
- 🎨 **Token-driven:** no hard-coded hex in components — everything flows from CSS variables so the
  theme engine re-skins the whole app at once.
- 🔒 **White-label safe:** resellers can still lock branding; per-user theming never overrides a
  reseller's enforced brand where the reseller disables it.

**Tech decisions (locked for the program)**

- **Motion:** `framer-motion` (via `LazyMotion` + `m` components for a tiny bundle) as the primitive
  engine; the **View Transitions API** for route/page crossfades where supported (progressive
  enhancement); CSS keyframes for always-on ambient loops (waveform). A thin `@vocaliq/ui/motion`
  module wraps it so pages never import framer-motion directly.
- **Data-viz:** `recharts` (already in the stack) themed to tokens, plus a small custom SVG/canvas kit
  for gauges/sparklines; `motion` for count-up numbers (a tiny `<NumberFlow>`-style component, no new
  dep if avoidable).
- **Icons/illustration:** `lucide-react` (present) + a small set of **procedural SVG** voice/agent
  illustrations (no heavy Lottie dependency unless a specific asset needs it; if so, `lottie-react`
  behind a lazy boundary).
- **Confetti/burst:** a tiny self-authored canvas burst (no dependency) or `canvas-confetti` behind a
  lazy import, fired only on milestone actions.
- **State:** `zustand` (present) for UI/theme/onboarding state; theme persisted to DB (a new
  `UserPreferences`/theme field) + hydrated from `localStorage` for instant first paint.

**Component library growth.** Today `packages/ui` has 4 components. We grow it to a real design-system
kit (~25–30 primitives), all animated + themed + a11y, so every dashboard screen composes from the
same vocabulary.

---

## 1. Phase Map & Sequencing

| Phase | UX-Days | Theme |
|-------|---------|-------|
| **A — Foundations** | 00–03 | Audit, motion engine, expanded tokens/color system, component kit v1 |
| **B — Voice identity** | 04–05 | Signature voice-motion primitives + AI-agent presence/illustration |
| **C — Navigation & micro-interactions** | 06–08 | Page transitions, sidebar/nav motion, CTA/button system |
| **D — Data-viz & dashboard redesigns** | 09–11 | Animated infographics kit + user/reseller/super-admin overview redesigns |
| **E — Theme engine & customization** | 12–13 | Per-user theme engine + Appearance settings page |
| **F — Onboarding & delight** | 14–16 | Multi-step onboarding + product tour + delight/polish/QA pass |

**Dependency notes:** 00 → 01 → 02 → 03 are strictly ordered (each builds the last). 04–05 need 01+02.
06–09 need 01+03. 10–11 need 09. 12–13 need 02 (token contract). 14–16 need 03+06+09. Do them in order;
a later day may lean on an earlier primitive.

> Total: **17 UX-Days** (00–16). Heavy days (03, 05, 12) may run two sessions — flagged inline.

---

## 2. The UX-Days (Super-Prompts)

> Each UX-Day header states a recommended model. Use **🧠 Opus** for architecture-shaped days (motion
> engine, theme engine, design system) and **⚡ Sonnet** for component/screen build-out. Every day ends
> with the **full self-audit (A–K)** with **special attention to H (UI/craft/a11y/motion), F
> (performance), and I (no regressions)** — and a commit/PR to `main` per `GIT-WORKFLOW.md`.

---

### UX-DAY 00 — Frontend Audit, Visual Language & Motion North-Star  🧠 OPUS

**Objective.** Establish the target: audit every screen, define the visual + motion language, and write
the north-star so all later days are consistent. **No shipping UI** beyond a living style/kitchen-sink
page — this day is the blueprint.

**Context to load.** `DESIGN-SYSTEM.md`, `apps/web` (all `dashboard/**` pages), `packages/ui`,
`globals.css`, `packages/ui/src/styles/ui.css`, `components/dashboard-shell.tsx`, `branding.ts`.

**Step-by-step build.**
1. **Screen inventory.** Enumerate every route under `apps/web/app/**` (user, reseller `/dashboard/
   reseller/*`, super-admin `/dashboard/admin/*`, public). For each: current state, motion gaps,
   color/infographic opportunities, a11y gaps. Output a table in `docs/UX-AUDIT.md`.
2. **Visual language spec.** Extend `DESIGN-SYSTEM.md` with: the expanded color system intent, elevation
   scale, spacing/density scale, radius scale, the **motion spec** (durations, easings, spring presets,
   the "enter/exit/state/feedback" taxonomy), and the **voice-motion vocabulary** (waveform states,
   speaking orb, conversation viz).
3. **Motion tokens (design only).** Define named motion tokens: `motion.fast/base/slow`,
   `ease.out/inOut/spring-soft/spring-bouncy`, stagger steps, and per-surface entrance choreography.
4. **Kitchen-sink route.** Add `apps/web/app/dashboard/_kitchen/page.tsx` (dev-only, gated like the dev
   login) that will render every new primitive as we build them — the living component gallery.
5. **Motion-level + theme contracts (interfaces only).** Define the TypeScript contracts for
   `ThemeConfig` (colors, radius, density, motion, font) and `MotionLevel` ('full'|'reduced'|'off')
   that later days implement. No implementation yet — just the shared types in `@vocaliq/shared`.

**Definition of Done.** `docs/UX-AUDIT.md` + expanded `DESIGN-SYSTEM.md` (motion + color + voice-motion
specs) + the `ThemeConfig`/`MotionLevel` type contracts + a stub kitchen-sink route. No visual
regressions. Typecheck/lint/build green.

**Commit plan.** `docs(ux): frontend audit + visual/motion north-star + theme contracts (UX-00)`.

---

### UX-DAY 01 — Motion Engine & Primitives  🧠 OPUS

**Objective.** Install and wrap the motion engine so every later day animates through **one thin,
reduced-motion-aware, performant** API — never importing framer-motion directly in pages.

**Step-by-step build.**
1. Add `framer-motion` to `packages/ui`. Create `@vocaliq/ui/motion`:
   - `MotionProvider` with `LazyMotion` (feature-split, `domAnimation`) mounted once in the web root.
   - Re-export a minimal `m` and `AnimatePresence`.
   - **Motion tokens** as JS constants mirroring the CSS tokens (durations, easings, springs).
2. **Primitives** (all honour a `useMotionLevel()` hook → full/reduced/off, seeded from
   `prefers-reduced-motion` + the user setting): `<Reveal>` (fade+rise on scroll/mount), `<Stagger>` +
   `<StaggerItem>`, `<Pop>` (scale-in), `<Fade>`, `<Collapse>`, `<AnimatedNumber>` (count-up), and a
   `<PageTransition>` wrapper. Each collapses to no-op (instant) when motion is off/reduced.
3. **`useMotionLevel` + store.** A zustand slice `motionLevel` (persisted); default derived from OS
   setting. Expose a global CSS class (`.motion-off`) that also disables CSS keyframes.
4. Migrate the existing ad-hoc classes (`vq-reveal`, `vq-stagger`, `vq-lift`) to the new primitives (or
   back them with the engine) — keep current behavior, remove duplication.
5. Render all primitives in the kitchen-sink route with reduced-motion toggles for QA.

**Definition of Done.** A page can do `<Reveal>`, `<Stagger>`, `<Pop>`, `<AnimatedNumber>`,
`<PageTransition>` from `@vocaliq/ui`; reduced-motion + a manual off switch fully neutralize motion;
bundle impact measured (LazyMotion keeps it small); kitchen-sink demos all primitives. No regressions.

**Self-audit focus.** F (bundle/perf), H (motion correctness), reduced-motion parity.

**Commit plan.** `feat(ui): motion engine + primitives (LazyMotion, reduced-motion aware) (UX-01)`.

---

### UX-DAY 02 — Expanded Color System, Elevation & Token Architecture  🧠 OPUS

**Objective.** Grow the 2-color palette into a **full semantic token system** that the theme engine can
re-skin: primary/secondary/accent scales, neutrals, semantic states, elevation, radius, density, and
data-viz categorical colors — all as CSS variables, light + dark.

**Step-by-step build.**
1. **Color scales.** For `primary` (violet), `secondary` (new — a complementary hue, e.g. indigo/teal),
   `accent` (cyan), and `neutral`: generate 50–900 steps as CSS vars, plus `-fg` (on-color) tokens for
   guaranteed AA contrast. Semantic: `success`/`warn`/`danger`/`info` scales.
2. **Data-viz palette.** A categorical set (`--viz-1..8`) + sequential + diverging ramps, tuned for
   both themes (colorblind-safe ordering).
3. **Surface/elevation.** `--surface-0..3` + shadow tokens (`--elev-1..3`) + a subtle "glass" token for
   overlays.
4. **Radius & density.** `--radius-*` (already present) + a **density** multiplier token (`--density`:
   comfortable/cozy/compact) that scales paddings/heights via utilities.
5. **Tailwind v4 mapping.** Map every token into `@theme` so `bg-primary-500`, `text-accent`,
   `bg-viz-3`, `shadow-elev-2`, etc. exist as utilities. Keep back-compat aliases (`vq-violet` →
   `primary-500`) so nothing breaks.
6. **Motion tokens as CSS vars** too (so keyframes read them).
7. Update `DESIGN-SYSTEM.md` with the full token table + usage rules ("never hard-code hex").

**Definition of Done.** A complete, documented token system (colors 50–900 + semantic + viz + elevation
+ radius + density + motion) as CSS vars mapped into Tailwind, light + dark, back-compat preserved,
AA-verified. Kitchen-sink shows every swatch/elevation/radius. No regressions.

**Commit plan.** `feat(ui): full semantic token system (color scales, elevation, density, viz) (UX-02)`.

---

### UX-DAY 03 — Component Kit v1 (core primitives, animated + themed)  ⚡ SONNET · *(may take 2 sessions)*

**Objective.** Build the missing core UI primitives so screens compose from a consistent, animated,
accessible vocabulary. Extends `packages/ui` from 4 → ~18 components.

**Build (each: token-driven, motion-primitive-powered, AA, keyboard, kitchen-sink demo):**
- **Feedback/overlay:** `Toast` + `<Toaster>` (queue, swipe-dismiss, variants), `Dialog`/`Modal`
  (focus-trap, scale+fade), `Sheet`/`Drawer` (spring slide), `Tooltip`, `Popover`, `DropdownMenu`,
  `AlertDialog`.
- **Display:** `Badge`, `Tag`/`Chip` (removable), `Avatar` (+ status ring), `Skeleton` (shimmer),
  `Progress` (linear + circular, animated), `Callout`/`Banner`, `EmptyState` (illustrated), `Separator`,
  `Kbd`.
- **Inputs:** `Switch` (spring thumb), `Checkbox`/`Radio` (draw-in check), `Select`/`Combobox`,
  `SegmentedControl`, `Slider`, `Textarea`, `Label`, `FormField` (error motion).
- **Nav/layout:** `Tabs` (animated `layoutId` indicator), `Stepper`, `Accordion` (`Collapse`).

**Definition of Done.** ~18 documented components in `packages/ui`, all in the kitchen-sink, all
a11y + reduced-motion safe + themed; a `Toaster` mounted app-wide; zero regressions; typecheck/lint/
build green. (Split across 2 PRs if needed: overlays+feedback, then inputs+nav.)

**Commit plan.** `feat(ui): component kit v1 — overlays, display, inputs, nav (animated, a11y) (UX-03)`.

---

### UX-DAY 04 — Signature Voice-Motion Primitives  🧠 OPUS

**Objective.** Build the voice/AI-voice motion vocabulary the product is *about* — reused across hero,
live call, loaders, agent cards, empty states. This is the differentiator.

**Build.**
1. **`<LiveWaveform amplitude|analyser>`** — upgrade the ambient waveform to an **amplitude-reactive**
   version driven by a Web Audio `AnalyserNode` (reuse the Day-95 hero approach), with `idle` (breathing)
   / `listening` / `speaking` / `thinking` states, violet→cyan gradient, reduced-motion static form.
2. **`<VoiceOrb state>`** — a pulsing/rippling orb (SVG + motion) representing the agent: `idle`,
   `listening` (inward ripples), `thinking` (rotating dashed ring / shimmer), `speaking` (amplitude
   pulse). The "AI agent presence" element.
3. **`<ConversationViz>`** — two nodes (agent ↔ caller) with an animated connection that lights up on the
   active speaker + a traveling pulse for turn-taking; used in call cards + the live console + landing.
4. **`<TranscriptStream>`** — word-by-word / caption reveal with a caret, speaker color-coding, and a
   "live" cyan pulse; drives the live-call view + demos.
5. **`<ThinkingDots>` / `<ListeningPulse>`** — small state indicators for agent status.
6. State machine: a shared `useAgentState()` (`idle→listening→thinking→speaking`) that all four
   components subscribe to, so a demo/live call choreographs them together.

**Definition of Done.** Five reusable voice-motion components, state-driven, reduced-motion safe,
themed, demoed together in the kitchen-sink as a mini "live call" choreography. Perf: canvas/AnimationFrame
throttled, cleaned up on unmount. No regressions.

**Self-audit focus.** H (does it feel like AI voice?), F (rAF/canvas perf + cleanup), A (state machine
correctness).

**Commit plan.** `feat(ui): signature voice-motion primitives (waveform, orb, conversation, transcript) (UX-04)`.

---

### UX-DAY 05 — AI-Agent Presence, Illustrations & Ambient Backgrounds  ⚡ SONNET · *(may take 2 sessions)*

**Objective.** Give agents a *face* and screens an atmosphere — procedural, themeable, performant.

**Build.**
1. **Agent avatar system** — procedural SVG avatars (gradient + geometric "voice" motifs, seeded by
   agent id so each agent looks distinct) that react to `useAgentState` (subtle idle motion, speaking
   pulse). Optional real image slot for video-avatar agents (Day 92).
2. **Ambient hero/section backgrounds** — a lazy, GPU-cheap mesh-gradient + drifting waveform-particle
   layer (canvas or CSS), reduced-motion → static gradient. Used on overview headers, empty states,
   auth pages, landing.
3. **Illustration set** — a small library of on-brand SVG illustrations for empty states (no agents,
   no calls, no leads, all-done), errors (404/500), and onboarding steps — animated on mount.
4. **Live-call console polish** — apply VoiceOrb + ConversationViz + TranscriptStream to the actual
   call detail / Agent Desk live views.

**Definition of Done.** Agent avatars render across agent lists/cards/desk; ambient backgrounds on key
surfaces (reduced-motion safe, lazy); illustrated empty/error states; live-call views use the voice
primitives. No regressions; CWV budget holds (backgrounds lazy + capped).

**Commit plan.** `feat(web): AI-agent avatars, ambient backgrounds, illustrated states (UX-05)`.

---

### UX-DAY 06 — Page & Route Transitions  🧠 OPUS

**Objective.** Make navigating the dashboard feel continuous and intentional — not a hard cut.

**Build.**
1. **View Transitions API** integration for App-Router navigations (progressive enhancement; fallback to
   `AnimatePresence` crossfade where unsupported). Scoped to `/dashboard/**`.
2. **`<PageTransition>`** applied in the dashboard shell `<main>` — content enters with a soft rise+fade,
   exits cleanly; keyed by route so it replays; reduced-motion → instant.
3. **Shared-element transitions** for the highest-value flows (e.g., agent card → agent builder header;
   call row → call detail) using `layoutId`.
4. **Skeleton → content choreography** — route loads show themed skeletons that crossfade into data
   (tie into TanStack Query loading states).
5. **Scroll restoration + focus management** on navigation (a11y): focus the main heading, restore
   scroll, announce route change to screen readers.

**Definition of Done.** Smooth, reduced-motion-safe transitions across dashboard routes; one shared-
element flow; skeleton crossfades; correct focus/scroll/AT announcements; no CLS regressions; INP budget
holds. No feature regressions.

**Commit plan.** `feat(web): page + shared-element route transitions (View Transitions + Framer) (UX-06)`.

---

### UX-DAY 07 — Sidebar & Navigation Micro-Interactions  ⚡ SONNET

**Objective.** Turn the ~50-item nav into a delightful, scannable, animated system for all three roles.

**Build.**
1. **Animated active indicator** — a single `layoutId` pill/bar that slides between active items.
2. **Nav restructure** — group the long nav into collapsible **sections** (e.g., Build, Run,
   Analyze, Grow, Admin) with spring expand/collapse + persisted open state; role-gated groups
   (reseller/super-admin) get their own animated sections.
3. **Micro-interactions** — icon hover/active micro-animations, hover reveal of labels when collapsed,
   press feedback, focus-visible.
4. **Collapsible sidebar** (desktop) with spring width + icon-only mode; **mobile nav drawer** (Sheet)
   with staggered item entrance.
5. **Contextual sub-nav** — per-section secondary nav (e.g., an agent's sub-tabs) with the same animated
   indicator.
6. **Command palette (⌘K)** — fuzzy nav + quick actions (create agent, place test call, switch tenant,
   change theme), animated open, keyboard-first. (Foundational; actions expand later.)

**Definition of Done.** Grouped, collapsible, animated nav for all roles; sliding active indicator;
mobile drawer; ⌘K palette navigates + runs core actions; fully keyboard + reduced-motion safe; no
regressions.

**Commit plan.** `feat(web): animated grouped sidebar + mobile drawer + ⌘K command palette (UX-07)`.

---

### UX-DAY 08 — CTA & Button Interaction System  ⚡ SONNET

**Objective.** Make every action *feel* responsive and rewarding — press, load, succeed, celebrate.

**Build.**
1. **Button interaction layer** — extend the `Button` with press (scale/spring), hover sheen, loading
   (spinner/dots morph), and **success** (checkmark draw-in) states; optional ripple; optional magnetic
   hover for hero CTAs. All reduced-motion safe.
2. **Optimistic + inline feedback** — standardize optimistic UI + inline success/failure motion for
   mutations (toast + local checkmark), via a `useActionFeedback` helper.
3. **Milestone celebration** — a lazy, tasteful confetti/particle burst fired ONLY on true milestones
   (first agent published, first call placed, wallet top-up, plan upgrade). Rate-limited + reduced-
   motion → a simple success toast.
4. **Copy/like/save micro-interactions** — copy-to-clipboard tick, star/pin bounce, toggle springs.
5. Apply across the highest-traffic CTAs (create agent, publish, place test call, top-up, invite,
   choose plan).

**Definition of Done.** A consistent, delightful button/CTA system with press/load/success states +
milestone celebration; optimistic feedback standardized; reduced-motion parity; no regressions.

**Commit plan.** `feat(ui): CTA interaction system — press/load/success + milestone celebration (UX-08)`.

---

### UX-DAY 09 — Animated Data-Viz & Infographics Kit  🧠 OPUS

**Objective.** Replace flat numbers with **animated, colorful, meaningful** infographics — the "more
infographics" ask — built once, used everywhere.

**Build (themed to the UX-02 viz palette, animated via UX-01 primitives):**
1. **Charts (Recharts, themed):** animated `AreaTrend`, `BarSeries`, `LineSeries`, `DonutBreakdown`,
   `StackedBar`, with token colors, gradient fills, animated draw-in, tooltips, empty states.
2. **Gauges & meters:** `RadialGauge` (e.g., success rate, sentiment), `Sparkline` (inline trends),
   `Meter`/`Bullet` (usage vs limit), all animated.
3. **Metric cards:** `StatCard` v2 with `<AnimatedNumber>` count-up, trend delta (▲/▼ colored),
   sparkline, and a subtle gradient/glow tied to sentiment (good→cyan/green, bad→amber).
4. **Distribution/heat:** a call-outcome donut, a day×hour **heatmap** (call volume), a sentiment
   ribbon/timeline.
5. **KPIs with context:** every number gets a comparison (vs last period) + a micro-trend.
6. A `docs/DATAVIZ.md` usage guide + kitchen-sink gallery.

**Definition of Done.** A reusable, themed, animated data-viz kit (charts, gauges, sparklines, metric
cards, heatmap) demoed in the kitchen-sink; performant (lazy, memoized); reduced-motion → static; AA
color contrast in all themes. No regressions.

**Commit plan.** `feat(ui): animated data-viz + infographics kit (charts, gauges, metric cards) (UX-09)`.

---

### UX-DAY 10 — User Dashboard Redesign (overview + key screens)  ⚡ SONNET

**Objective.** Rebuild the **user** dashboard overview + top screens (Agents, Calls, Analytics, Wallet)
into colorful, infographic-rich, animated, scannable surfaces using UX-04/05/09.

**Build.**
1. **Overview** — a hero band (ambient bg + VoiceOrb/waveform + greeting + primary CTAs), a KPI row
   (StatCard v2 with count-up + sparklines + deltas), a live-activity feed (recent calls with
   ConversationViz mini + sentiment color), a "what to do next" smart card, and the onboarding checklist
   v2 — all staggered-in.
2. **Agents** — richer cards (agent avatar, status, channel chips, mini usage sparkline), animated
   grid, hover lift, quick actions.
3. **Calls** — a filterable, animated table with sentiment/outcome color, expandable rows → mini
   transcript, and a summary infographic header.
4. **Analytics** — the viz kit applied: trend area, outcome donut, sentiment ribbon, heatmap, KPI cards.
5. **Wallet/Billing** — the advanced-tier card polished + a spend sparkline + usage meters.

**Definition of Done.** A visibly elevated, animated, colorful, infographic-rich user dashboard;
skeletons + empty states; reduced-motion safe; data still correct (uses existing hooks); CWV budget
holds; no regressions.

**Commit plan.** `feat(web): user dashboard redesign — animated, infographic overview + key screens (UX-10)`.

---

### UX-DAY 11 — Reseller & Super-Admin Dashboard Redesigns  ⚡ SONNET

**Objective.** Apply the same elevation to the **reseller portal** and **super-admin** panels — but
tuned to their jobs (oversight, margins, provisioning) and kept **lighter/denser** (power-user density).

**Build.**
1. **Reseller** — a revenue/margin overview (animated area + donut of sub-tenant mix + margin gauge),
   an animated sub-tenant table (health, usage sparkline, status), quick provision CTA, white-label
   theming preview.
2. **Super-admin** — a platform-health overview (tenants, calls, spend, error rate as animated KPIs +
   trend), an animated tenants table with search/filter, key-vault/governance screens polished, plan-
   builder with live preview.
3. **Density mode** — these dashboards default to **cozy/compact** density (via the UX-02 density token)
   for information density, still animated but restrained.

**Definition of Done.** Reseller + super-admin dashboards elevated with role-appropriate infographics +
animation, denser layout, correct data, reduced-motion safe, no regressions.

**Commit plan.** `feat(web): reseller + super-admin dashboard redesigns (infographics, density) (UX-11)`.

---

### UX-DAY 12 — Theme Engine (per-user, multi-theme, custom colors)  🧠 OPUS · *(may take 2 sessions)*

**Objective.** The customization ask: a real **theme engine** so users pick from multiple presets AND
customize primary/secondary/accent + radius + density + motion + font — persisted per user, applied
instantly, respecting the reseller white-label hierarchy.

**Build.**
1. **Theme model.** Extend `ThemeConfig` (UX-00) → `{ preset, colors: {primary, secondary, accent},
   neutralTint, radius, density, motionLevel, font, mode }`. Store per user (a new `theme` field on the
   user/preferences in `packages/db` + a `/me/theme` API) + mirror to `localStorage` for instant paint.
2. **Resolution hierarchy.** `platform default → reseller white-label (Day 52) → per-user theme`, with a
   reseller "lock branding" flag that can pin brand colors while still allowing user radius/density/
   motion/mode. Implement `resolveTheme()` (pure, in `@vocaliq/shared`, unit-tested).
3. **Runtime application.** Derive the full token set (all UX-02 scales) from the chosen base colors
   (generate 50–900 ramps + AA-safe `-fg` tokens at runtime) and write CSS vars on `:root`
   (extend `BrandingApplier` → `ThemeApplier`). No flash of default theme (SSR/inline the persisted
   theme).
4. **Preset library.** ~8 built-in themes, each with light+dark: **Nebula** (violet/cyan — default),
   **Aurora** (teal/green), **Sunset** (amber/rose), **Mono** (neutral/ink), **Ocean** (blue/cyan),
   **Grape** (purple/magenta), **Forest** (green/lime), **Contrast** (high-contrast a11y). Each AA-
   verified in both modes.
5. **Guardrails.** Auto-contrast correction so a user's custom color never produces unreadable text;
   never break `cyan = live` semantics unless the theme explicitly remaps "live".

**Definition of Done.** A per-user, DB-persisted theme engine: presets + custom primary/secondary/accent
+ radius/density/motion/font, instant apply (no FOUC), AA-guaranteed in every theme, reseller hierarchy
respected, `resolveTheme` unit-tested, no regressions.

**Self-audit focus.** C (per-user data + isolation), H (AA in every theme), A (resolution correctness),
I (branding hierarchy unchanged for resellers).

**Commit plan.** `feat(web,api,db): per-user theme engine (presets + custom tokens, AA-safe) (UX-12)`.

---

### UX-DAY 13 — Appearance Settings & Live Theme Studio  ⚡ SONNET

**Objective.** The UI for the theme engine — a delightful, modern "Appearance" settings page with a
**live preview**.

**Build.**
1. **Appearance page** (`/dashboard/settings/appearance`): theme **gallery** (animated preset cards,
   each a live mini-preview), mode toggle (light/dark/system), custom **color pickers** (primary/
   secondary/accent with swatches + hex + eyedropper), **radius**/**density**/**motion**/**font**
   controls (segmented + sliders), and **Reset**.
2. **Live preview panel** — a mini-dashboard (KPI card + button + waveform + chart) that re-skins in
   real time as the user tweaks, before saving.
3. **Persistence + sync** — save to `/me/theme`, optimistic apply, cross-tab sync (storage event).
4. **Nav entry** + a quick theme switcher in the ⌘K palette and the user menu.
5. **Onboarding hook** — offer theme selection as an optional onboarding step (ties to UX-14).

**Definition of Done.** A beautiful, animated Appearance page with preset gallery + custom controls +
real-time live preview + persistence + cross-tab sync; reachable from nav, user menu, ⌘K; a11y + reduced-
motion safe; no regressions.

**Commit plan.** `feat(web): Appearance settings + live theme studio (UX-13)`.

---

### UX-DAY 14 — Modern Onboarding & Product Tour  🧠 OPUS

**Objective.** A modern-SaaS onboarding: a guided, multi-step wizard + contextual tour that gets a new
user to first value fast — with the "do this in 2/3/5 steps" flows the admin asked for.

**Build.**
1. **Onboarding wizard** (first-run, resumable, skippable) — a **5-step** flow:
   `Welcome → Pick your use-case (sales/support/appointments/surveys) → Create your first agent (guided)
   → Connect a channel or number → Invite your team / done` — with progress, per-step illustrations
   (UX-05), staggered motion, and a celebratory finish (confetti).
2. **Micro-flows** — shorter contextual flows reused elsewhere: a **3-step** "publish your agent"
   (configure → test call → publish) and a **2-step** "go live on a channel" (connect → verify),
   surfaced as inline guided sequences.
3. **Product tour / coachmarks** — a spotlight/coachmark system (`<TourStep>`) that can highlight any
   element with a tooltip + progress ("2 of 5"), triggered on first visit to a new area; dismissible +
   resumable; persisted per user.
4. **Checklist v2** — the existing `OnboardingChecklist` upgraded: animated progress ring, step
   completion celebration, smart next-step, dismiss when done.
5. **Empty-state onboarding** — empty screens double as onboarding (illustrated + a single clear CTA +
   a "watch 30s demo" that plays the voice-motion choreography).

**Definition of Done.** A resumable 5-step first-run wizard + reusable 2/3-step micro-flows + a
coachmark tour + checklist v2 + onboarding empty states; all persisted per user, skippable, reduced-
motion safe, a11y (focus-trapped, keyboard); measurable via PostHog events; no regressions.

**Self-audit focus.** H (delight + clarity), C (per-user onboarding state), A (resumability), analytics
events fire.

**Commit plan.** `feat(web): modern onboarding wizard + product tour + checklist v2 (UX-14)`.

---

### UX-DAY 15 — Delight, Notifications & Sound (optional)  ⚡ SONNET

**Objective.** The finishing delight layer — a real notification center, loading choreography, optional
tasteful sound, and the small touches that make it feel premium.

**Build.**
1. **Notification center** — a bell + animated panel (new lead, call finished, low balance, agent
   published), unread badges, group/dismiss, real-time-ready (Socket.IO hook point). Toasts route here.
2. **Loading choreography** — coordinated skeleton → content across the shell; route-level progress bar
   (top, cyan); optimistic transitions everywhere.
3. **Optional sound** (off by default, user-toggle) — subtle, on-brand cues for call-connected /
   success / notification, respecting a "sound" setting + reduced-motion/quiet-hours.
4. **Micro-delight** — animated theme-switch transition, an easter-egg on the waveform, a celebratory
   "milestone" modal (100th call, first conversion), tasteful hover states everywhere.
5. **Keyboard everywhere** — shortcuts overlay (`?`), focus rings, roving tabindex on lists/menus.

**Definition of Done.** A notification center, coordinated loading, optional sound, keyboard shortcuts +
overlay, and consistent micro-delight; all opt-out-able and reduced-motion/quiet safe; no regressions.

**Commit plan.** `feat(web): notification center + loading choreography + delight layer (UX-15)`.

---

### UX-DAY 16 — Pixel-Perfect QA, Accessibility & Performance Hardening  🧠 OPUS

**Objective.** The gate. Make it *pixel-perfect*, accessible, fast, and consistent across every theme,
role, breakpoint, and motion setting — then tag the UI release.

**Build.**
1. **Design QA sweep** — every screen (user/reseller/super-admin/public) at mobile/tablet/desktop, in
   light+dark + all presets: spacing, alignment, truncation, empty/loading/error states, contrast.
   Fix every pixel nit. Output a checklist in `docs/UX-QA.md`.
2. **Accessibility audit** — automated (axe) + manual keyboard + screen-reader pass on core flows;
   fix AA violations; verify reduced-motion + motion-off parity on every animated surface.
3. **Performance pass** — bundle analysis (LazyMotion/code-split verified), lazy charts/canvas, image/
   asset optimization, CWV budget verification (LCP/INP/CLS) on the dashboard + landing; add a CWV/
   bundle check to CI if feasible.
4. **Cross-theme regression** — snapshot/visual check of key screens across a few themes; ensure tokens
   (not hard-coded hex) drive everything.
5. **Docs** — finalize `DESIGN-SYSTEM.md` (now the living source of truth), `docs/UX-QA.md`, and a
   short "how to add an animated, themed screen" contributor guide.
6. **Tag** the UI release (e.g., `v1.3.0-ux`) after merge.

**Definition of Done.** Full A–K self-audit across the program; AA-clean, CWV-green, pixel-perfect in
every theme/role/breakpoint/motion-setting; docs finalized; UI release tagged. Nothing regressed.

**Commit plan.** `chore(ux): pixel-perfect QA + a11y + performance hardening + release tag (UX-16)`.

---

## 3. Cross-Cutting Deliverables (produced across the days)

- **`packages/ui`** grows from 4 → ~30 primitives + a `@vocaliq/ui/motion` engine + voice-motion +
  data-viz kits — all token-driven, animated, a11y, reduced-motion safe.
- **Theme engine** (`resolveTheme` in `@vocaliq/shared`, `ThemeApplier`, `/me/theme` API, DB field, 8
  presets + full custom controls) with a live **Appearance** studio.
- **Motion system** (`useMotionLevel`, primitives, page/route transitions, CTA system, celebrations) —
  globally togglable, reduced-motion-first.
- **Onboarding** (5-step wizard, 2/3-step micro-flows, coachmark tour, checklist v2, onboarding empty
  states) + PostHog instrumentation.
- **Redesigned dashboards** for user, reseller, super-admin — colorful, infographic-rich, animated,
  role-tuned density.
- **Docs:** `UX-AUDIT.md`, expanded `DESIGN-SYSTEM.md`, `DATAVIZ.md`, `UX-QA.md`, a contributor guide,
  and this plan.

## 4. Global Definition of Done (every UX-Day)

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green; no feature regressions (the 94-day app
  still works end-to-end).
- **A11y AA** + **reduced-motion parity** + **motion-off parity** on every new/changed surface.
- **Token-driven** (no hard-coded hex); works in light + dark + presets.
- **CWV budget** respected; heavy visuals lazy/code-split; LazyMotion.
- Kitchen-sink updated for any new primitive.
- Full **self-audit A–K** written; committed + pushed + PR → CI green → merged to `main`; `BUILD-LOG.md`
  updated.

## 5. Suggested Execution Order & Cadence

00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16.

Foundations (00–03) unlock everything; do them first and don't skip. Voice identity (04–05) and viz
(09) are the highest "wow" per day — front-load if you want early visible impact after foundations.
Theme engine (12) is architecture-heavy — budget two sessions. QA (16) is the mandatory gate before
calling it done.

> **Next action:** confirm this plan (or tell me what to add/cut/reorder — e.g., start with a specific
> screen, add a particular theme, or a specific animation you have in mind), and I'll execute **UX-DAY
> 00** exactly like a normal build-day: branch → build → self-audit → PR → CI → merge.
