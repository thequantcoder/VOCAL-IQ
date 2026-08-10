# DESIGN-SYSTEM.md — VocalIQ Visual Identity, UX & Motion

This is the design bible. Every UI day reads it. The goal: a UI that **looks like the category leader, not a templated dashboard** — distinctive, modern (2026), fast, accessible, and beautiful on the surfaces that sell the product (builder, live-call view, dashboards, landing, onboarding).

> Read this with `frontend-design` principles in mind: spend boldness in one place, keep the rest disciplined, ground every choice in the subject (an AI that *talks*), and never ship the generic shadcn default look.

---

## 0. The design thesis (ground everything here)

VocalIQ's subject is **voice** — sound, conversation, waveforms, real-time, the moment a machine speaks like a person. The interface should *feel* like that: **calm and spatial, with sound made visible.** Audio waveforms, live transcript streams, and "speaking" states are the signature motifs — not generic SaaS cards.

**One-line direction:** *"A control room for voice — quiet, precise, dark-first, with sound visualised as the hero motif and motion that mirrors a real conversation's rhythm."*

The single **signature element** (spend boldness here): a **living waveform** that appears on the landing hero, the live-call view, and the loading states — the same visual language everywhere, so the product is instantly recognisable.

---

## 1. Brand & palette

Dark-first (operators stare at this all day; voice tooling reads as "studio/control room"). Light mode is a first-class equal, not an afterthought.

**Core palette (define as CSS variables / Tailwind tokens):**
```
--vq-bg-base      #0B0B12   (near-black, faint violet undertone — not pure black)
--vq-bg-elevated  #14141F   (cards/surfaces)
--vq-bg-overlay   #1C1C2B
--vq-border       #262635   (hairline, low-contrast)
--vq-violet       #7C5CFF   (primary brand — electric, modern)
--vq-violet-deep  #5B21B6   (pressed/active)
--vq-cyan         #22D3EE   (the "live/speaking" accent — only for active/real-time states)
--vq-text-hi      #F4F4FB   (primary text)
--vq-text-lo      #9A9AB2   (secondary text)
--vq-success      #34D399
--vq-warn         #FBBF24
--vq-danger       #FB7185
```
**Rule:** **cyan means "live."** Reserve it for active calls, speaking states, real-time pulses. Violet is the brand/CTA. Everything else is quiet greys. This restraint is what separates premium from busy.

Gradients: use sparingly — one signature gradient (`violet → cyan`) for the waveform + hero only. Never gradient-spam buttons.

---

## 2. Typography

Avoid the default Inter-everywhere look. Pair deliberately:
```
Display / headings:  "Clash Display" or "General Sans" (geometric, characterful, confident) — used with restraint, big
Body / UI:           "Inter" or "Geist" (clean, legible at small sizes, data-dense screens)
Mono / data:         "Geist Mono" or "JetBrains Mono" (transcripts, code, metrics, latency numbers)
```
Type scale (rem): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 2 / 2.5 / 3.5 / 4.5. Tight tracking on display, normal on body. Use the **mono face for anything numeric or transcript-like** — it reinforces the "voice console" feel and makes data scannable.

> If those display faces aren't licensed/available, substitute a comparable characterful geometric face — but **don't** fall back to Inter-as-display. The display face is part of the identity.

---

## 3. Layout, spacing, elevation

- **8px spacing grid.** Generous whitespace — premium tools breathe. Don't cram.
- **Radii:** 10px default, 14px cards, 999px pills/avatars. Consistent, slightly rounded (modern, friendly-but-serious).
- **Elevation by light, not heavy shadows:** subtle border + a faint inner/raised glow on dark; soft diffuse shadows on light. Avoid heavy drop-shadows (dated).
- **Hairline borders** (`--vq-border`) separate surfaces — quiet, precise.
- **Density modes:** comfortable (default) and compact (power users / data tables) — a toggle.
- **Max content width** with a calm left nav; the builder + live-call go full-bleed.

---

## 4. Motion choreography (deliberate, not scattered)

Motion mirrors **conversation rhythm** — things ease in like speech, pulse when "live," settle when done. Use Framer Motion; respect `prefers-reduced-motion` everywhere (provide instant non-animated fallbacks).

**Timing system:**
```
--ease-out-soft   cubic-bezier(0.22, 1, 0.36, 1)   (most UI — entrances)
--ease-spring     spring(stiffness 260, damping 26) (interactive/dragged)
fast 120ms · base 220ms · slow 380ms · ambient 1.5–3s (loops)
```

**Where motion goes (and where it doesn't):**
| Surface | Motion |
|---------|--------|
| Page/route transitions | Subtle fade+rise (8px), 220ms. Never slide whole pages. |
| Cards/lists entering | Auto-Animate / stagger 30ms; max ~6 staggered items. |
| Buttons/inputs | Micro: 120ms scale 0.98 on press, focus ring grow. |
| **Live call "speaking"** | Cyan waveform pulses in real time to audio amplitude — the signature. |
| Active node in builder | Soft cyan glow pulse on the currently-executing node. |
| Dashboards | Charts draw-in once on load (380ms), then static. Numbers count up once. |
| Loading | The waveform motif animating — not a generic spinner. |
| Success/empty | One tasteful Lottie moment (not on every action). |
| Toasts | Slide+fade from top-right, 220ms, auto-dismiss. |

**Restraint rule:** if a screen has the live-waveform doing the talking, everything else stays still. Scattered animation = "AI-generated" feel. One orchestrated moment per screen beats ten small ones.

---

## 5. The hero surfaces (these sell the product — design them, don't just build them)

### 5a. Landing page / marketing hero
- **Hero = a live, interactive waveform** that responds to a sample AI voice playing ("Hear it talk" button) — the most characteristic thing in the product's world, per the design thesis. Not a big-number-stat template.
- Headline in the display face, confident, specific ("AI that picks up the phone." not "Transform your business with AI").
- Below the fold: the builder canvas shown in motion, a live-call mock with streaming transcript, logos, then a real interactive demo if possible.
- One signature gradient (violet→cyan) on the waveform only.

### 5b. The visual agent builder (React Flow) — the product's soul
- Spatial dark canvas; nodes are crisp cards with a clear type-color system (greeting, logic, tool, knowledge, transfer each have a quiet hue).
- **Active-node glow** during live test (cyan pulse). Animated edges showing flow direction on hover.
- Smooth pan/zoom with spring; snapping; a mini-map; command palette (`cmd-K`) to add nodes.
- Right-panel config slides in with `--ease-out-soft`. Drag from a node port to create — satisfying, springy.
- This is where you spend the most polish budget.

### 5c. The live-call view
- The **waveform is the centrepiece**, pulsing cyan to the live audio.
- Streaming transcript in the mono face, speaker-diarized, auto-scrolling, with the current word subtly highlighted.
- Live metrics (latency, sentiment, cost ticking up) in small mono labels around it.
- Active builder node mirrored here. Barge-in/interruption shown as a visual beat.
- It should feel like a **mission-control console**.

### 5d. Analytics dashboards
- Calm, data-dense but breathable. Mono for all numbers.
- Charts (Recharts/visx) draw in once; bespoke voice viz (sentiment-over-call, talk/listen ratio) using visx.
- Real-time tiles pulse cyan when updating live. Filters are instant + URL-synced.

### 5e. Reseller / super-admin panels
- Same system, slightly denser. Clear visual hierarchy between platform → reseller → customer scope (a persistent scope indicator so you always know "where" you are).

---

## 6. Smart user onboarding (first-value-fast — a senior-FE priority)

Onboarding is where products win or lose users. Build it as a designed experience, not a checklist afterthought:

1. **Progressive, not upfront.** Ask the minimum to start; reveal complexity as needed. No 10-field setup wall.
2. **Goal-based first step:** "What do you want your first agent to do?" → pick (book appointments / qualify leads / answer support) → pre-load a matching template so they see value in <5 minutes.
3. **Interactive guided tour** (not a static modal): spotlight the builder, let them place one node, place a test call to *their own phone* in the first session — the "aha" moment is hearing the agent call them.
4. **Live progress checklist** (persistent, dismissible): create agent → connect number → test call → invite team → go live. Celebrate completion (one Lottie moment).
5. **Empty states are onboarding:** every empty screen teaches + has a primary CTA ("No agents yet — clone a template or start blank").
6. **Contextual tooltips + `?` hints** on complex surfaces (builder, SIP, billing), dismissible, never nagging.
7. **Sample data / demo agent** pre-seeded so dashboards aren't barren on day one.
8. **Resume where you left off** — onboarding state persists.
9. **Reseller onboarding is its own flow** (branding → domain → first sub-tenant → pricing).

---

## 7. The senior/expert front-end checklist (what great FE devs actually obsess over)

Build every screen to this floor — it's the difference between "works" and "feels expensive":

**Perceived performance**
- Optimistic UI on mutations; skeletons (not spinners) for loads; stream data progressively.
- Route-level code splitting; prefetch on hover/intent; keep TTI low.
- Virtualise long lists/tables (calls, leads, transcripts) — never render 10k rows.
- Instant filter/search (debounced, URL-synced, back-button-safe).
- **Image/asset optimization:** use `next/image` (responsive, lazy, modern formats); optimise/lazy-load heavy visuals; subset fonts; budget bundle size.

**Resilience (don't let one component kill the app)**
- **React error boundaries** at the app shell + each major route/section, with a friendly recover/retry fallback (never a white screen); report the error to Sentry with context.
- Suspense boundaries for async UI; graceful degradation when a real-time socket drops (reconnect + stale indicator).

**The four states, always**
- Loading / empty / error / success designed for *every* async view — no blank flashes, no dead ends.

**Accessibility (WCAG AA, non-negotiable)**
- Full keyboard nav; visible focus rings; ARIA where needed; semantic HTML.
- Color contrast AA in both themes; never color-only signalling (pair with icon/text).
- `prefers-reduced-motion` honoured with real fallbacks; screen-reader labels on icon buttons.
- Respect `prefers-color-scheme` for initial theme.

**Responsiveness**
- Mobile-first; the dashboard, lists, and live-call view work down to phone. The builder canvas gracefully degrades to view/lightedit on mobile.
- Touch targets ≥44px; no hover-only affordances.

**Forms & input (where users live)**
- Inline validation (Zod-driven) with helpful, specific messages; never lose entered data on error.
- Autosave where sensible (builder, settings) with a clear saved indicator.
- Sensible defaults; smart paste (e.g. paste a phone list → auto-parse); keyboard submit.

**Consistency & polish**
- One component library (`packages/ui`); never one-off styles. Consistent verb vocabulary ("Publish" → "Published").
- Consistent iconography (lucide), spacing, radii. Command palette (`cmd-K`) for power users.
- Toasts for feedback; confirmations for destructive actions (with undo where possible).
- Theming honours tenant white-label tokens (so resellers' brands flow through every component).

**Trust & feel**
- Real-time presence/sync feels alive (Socket.IO-driven) without being noisy.
- Number formatting, currency, dates, timezones localised (ties to i18n Day 68).
- Micro-interactions on the things people touch most (buttons, toggles, node ports).
- Loading the app shows the brand waveform, not a white flash.

**Quality gates**
- Storybook (or equivalent) for `packages/ui` components.
- Visual regression checks on key screens; Playwright covers critical journeys including a11y assertions.
- Lighthouse/Core Web Vitals budget in CI for the marketing + app shell.

---

## 8. Component standards (`packages/ui`)
- Built on shadcn/Radix but **re-skinned to the VocalIQ identity** (don't ship shadcn defaults — restyle tokens, radii, motion, focus).
- Every component: dark+light, keyboard-accessible, reduced-motion-aware, themeable via tenant tokens.
- Core set: Button (variants), Input/Select/Combobox, Card, Dialog/Drawer (vaul), Table (TanStack), Tabs, Toast (sonner), Command palette (cmdk), Tooltip, Badge/Pill, Avatar, Skeleton, EmptyState, ErrorState, StatTile, Waveform (signature), TranscriptStream, NodeCard (builder), ChartCard.

---

## 9. Copy/voice (UI writing — design material, not decoration)
- Plain verbs, sentence case, specific over clever. "Place test call," not "Initiate."
- Name things by what users control ("Phone numbers," not "Telephony config").
- Errors explain what happened + how to fix, in the product's voice — never apologise vaguely.
- Actions keep their name through the flow ("Publish" button → "Published" toast).
- Empty states invite action.

---

## 10. How this threads into the build (design checkpoints by day)
- **Day 1:** implement this token system (palette, type, radii, motion vars, dark+light) + the Waveform + base components in `packages/ui`. Don't ship shadcn defaults.
- **Day 14 (first dashboard):** apply hero-surface standards; four-states; live-call view v1 with the waveform.
- **Day 17 (builder):** the §5b spec — this gets the most polish.
- **Day 23 (test panel):** active-node glow, live transcript stream.
- **Day 41 (analytics):** §5d dashboards.
- **Day 50 (onboarding + motion polish):** the full §6 onboarding + a motion pass to §4 across the app.
- **Day 52 (white-label):** tenant tokens flow through every component (§8).
- **Day 54/55 (reseller/super-admin):** §5e scope-aware panels.
- **A marketing landing page** (build when you launch, ~Day 66): the §5a hero.
- **Every UI day:** meet the §7 senior-FE checklist before the self-audit passes.

> Design is not a phase. Each UI day's self-audit (Section H) must check against this file: identity applied (not defaults), four states, a11y AA, reduced-motion, responsive, the right motion, and the senior-FE floor.

---

## 11. UI/UX Elevation Program — expanded specs (UX-00)

> Added by the UI/UX Elevation program (`UI-UX-ELEVATION-PLAN.md`). This section is the **expanded,
> implementation-grade** spec that supersedes/extends §1 (palette), §3 (elevation), §4 (motion) as the
> program builds. Contracts live in `@vocaliq/shared` → `theme.ts`. Nothing here is decorative — every
> token/motion maps to meaning.

### 11.1 Motion spec v2 (the taxonomy + tokens)

**Every animation maps to one kind** (`MOTION_KINDS`): `enter` (mount/appear), `exit` (unmount),
`state` (a value/status change), `feedback` (response to a user action), `ambient` (always-on, e.g. the
waveform). If an animation isn't one of these, cut it.

- **Durations** (`MOTION_DURATIONS`, ms): `instant 0 · fast 120 · base 220 · slow 380 · slower 560`.
  Enter/exit ≈ base; feedback ≈ fast; big spatial moves ≈ slow.
- **Easings** (`MOTION_EASINGS`): `out` (house ease — calm, decisive) for enters; `inOut` for moves;
  `in` for exits; `emphasized` for hero moments.
- **Springs** (`MOTION_SPRINGS`): `soft` (default interactive), `snappy` (toggles/controls), `bouncy`
  (celebration only).
- **Stagger**: `STAGGER_STEP` = 0.045s between list/grid children.
- **Discipline:** transform + opacity only (60fps); no animating layout/color that thrashes; everything
  honours `MotionLevel` (`full`/`reduced`/`off`) — reduced/off collapse to instant. A global `.motion-off`
  class disables CSS keyframes too.

### 11.2 Expanded color system (UX-02 builds this)

- **Scales 50–900** for `primary` (violet), `secondary` (new complementary hue), `accent` (cyan),
  `neutral`; plus `-fg` (on-color) tokens guaranteeing AA contrast on each step.
- **Semantic** scales: `success` `warn` `danger` `info`.
- **Data-viz palette**: categorical `--viz-1..8` (colorblind-safe order) + sequential + diverging ramps,
  tuned per mode.
- **Rule:** components read CSS variables only — **never hard-code hex**. Back-compat aliases keep
  `--vq-violet` = `primary-500`, `--vq-cyan` = `accent-500` so nothing breaks.
- **"More colorful" reconciled with §0 restraint:** neutral surfaces stay calm; color escalates around
  meaning (cyan = live; sentiment/outcome color on data; gradient accents on hero/CTA). An optional
  **Vivid** density/theme raises saturation for users who want it — opt-in, never default.

### 11.3 Elevation, radius & density

- **Surfaces** `--surface-0..3` + **shadows** `--elev-1..3` + a subtle **glass** token for overlays.
- **Radius** scale (`sharp`/`soft`/`round`) via `--radius-*`; user-selectable (theme engine).
- **Density** (`comfortable`/`cozy`/`compact`) via a `--density` multiplier scaling paddings + control
  heights. Reseller/super-admin default to **cozy**; data-heavy tables to **compact**.

### 11.4 Voice-motion vocabulary (the identity — UX-04)

The product can "hear and speak"; these are first-class, reused everywhere:

- **`LiveWaveform`** — amplitude-reactive (Web Audio `AnalyserNode`), states: `idle` (breathing) /
  `listening` / `thinking` / `speaking`; violet→cyan gradient; reduced-motion → static silhouette.
- **`VoiceOrb`** — the agent's presence: `idle` (soft pulse) / `listening` (inward ripples) / `thinking`
  (rotating dashed ring) / `speaking` (amplitude pulse).
- **`ConversationViz`** — agent ↔ caller nodes with a connection that lights the active speaker + a
  traveling pulse for turn-taking.
- **`TranscriptStream`** — word-by-word caption reveal, speaker color-coding, live cyan pulse.
- **`ThinkingDots` / `ListeningPulse`** — small state indicators.
- A shared `useAgentState()` (`idle→listening→thinking→speaking`) choreographs them together.

### 11.5 Theme engine (UX-12/13)

Resolution: **platform default → reseller white-label (§8 branding) → per-user theme**. Per-user
`ThemeConfig` = `{ preset, mode, colors{primary,secondary,accent}, radius, density, motion, font }`.
Runtime generates the full 50–900 ramps + AA-safe `-fg` tokens from the base colors and writes CSS vars
at `:root` (no FOUC — persisted theme inlined on first paint). 8 presets (`nebula` default, `aurora`,
`sunset`, `mono`, `ocean`, `grape`, `forest`, `contrast`), each AA in light + dark. Guardrail:
auto-contrast correction so a custom color can never produce unreadable text; a reseller may lock brand
colors while still allowing user radius/density/motion/mode.

### 11.6 Per-day self-audit addendum (H, F, I)

Beyond §7, every UX-Day's self-audit must confirm: **motion maps to a kind** + reduced-motion/off parity;
**AA contrast in every theme** (light+dark+presets); **CWV budget** (LCP<2.5s, INP<200ms, CLS<0.02 on
the shell) + LazyMotion/code-split; **token-driven** (no hard-coded hex); and **no regression** to the
working app.

### 11.7 Token reference (UX-02 — implemented)

The token layer lives in `apps/web/app/globals.css` (`:root` + `.dark` + `@theme inline`). All are CSS
variables mapped to Tailwind utilities. **Rule: components use these — never hard-code hex.**

- **Scales** `--primary-50…900`, `--secondary-50…900`, `--accent-50…900`, `--neutral-50…900` +
  `--primary-fg`/`--secondary-fg`/`--accent-fg` (AA on-color text). Utilities: `bg-primary-500`,
  `text-accent-300`, `border-neutral-200`, `text-primary-fg`, …
- **Semantic** `--success|warn|danger|info` + `-fg` + `-subtle` (subtle bg flips in dark). Utilities:
  `bg-success`, `text-danger-fg`, `bg-warn-subtle`, …
- **Data-viz** `--viz-1…8` (categorical). Utilities: `bg-viz-1` … `bg-viz-8` (charts theme to these).
- **Surfaces** `--bg-base`/`--bg-elevated`/`--bg-overlay`/`--surface-3` + `--glass`. Utilities:
  `bg-surface-0…3`, `bg-glass` (+ the legacy `bg-vq-bg-*`).
- **Elevation** `--elev-1…3` → `shadow-elev-1|2|3` (light + dark tuned).
- **Radius** `--radius-sm|·|-card|-lg|-pill` → `rounded-vq-sm|vq|vq-card|vq-lg|vq-pill`.
- **Density** `--density` (1 = comfortable) — control padding/height multiplier (applied UX-03/12).
- **Motion** `--dur-fast|base|slow|slower`, `--ease-out-soft`, `--ease-emphasized` (+ the JS mirror in
  `@vocaliq/ui/motion`).
- **Back-compat:** `--vq-violet`=`--primary-500`, `--vq-cyan`=`--accent-500`, `--vq-success|warn|danger`
  alias the semantics — every existing `bg-vq-*`/`text-vq-*` utility keeps working (self-audit I).

Live swatches (every scale/semantic/viz/elevation/radius, both themes) render at `/dashboard/kitchen`.
