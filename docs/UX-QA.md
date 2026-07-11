# UX-QA.md — UI/UX Elevation: Final QA, Accessibility & Performance Gate (UX-16)

> The closing gate for the UI/UX Elevation program (UX-00 → UX-16). This is the living QA checklist +
> the results of the final sweep. Re-run it before any UI release.

## Release

- **Tag:** `v1.3.0-ux` (cut after the UX-16 merge).
- **Scope:** the whole `apps/web` surface + the `@vocaliq/ui` kit (components, `/motion`, `/voice`,
  `/charts`) + the theme engine (`@vocaliq/shared/theme-runtime`).

---

## 1. Design QA sweep — results

Method: static audit across screens (user / reseller / super-admin / public) for spacing, alignment,
truncation, empty/loading/error states, and token discipline; plus an automated component sweep.

**Fixed in UX-16:**
- Reduced-motion gaps: added `motion-reduce:animate-none` to every always-on Tailwind animation that
  lacked it — the `AvatarStatus` "live" pulse (`@vocaliq/ui`), the analytics live-tile pulse, the
  RefreshCw button spinners (branding / mcp / search), and the landing/widget pulses.
- A11y: added `sr-only` `<caption>`s to the **leads** + **experiments** tables.
- Responsive: the product-tour tooltip width now clamps to the viewport (`w-[min(300px,calc(100vw-24px))]`)
  so it never overflows on mobile.
- Token discipline: the appearance color-field invalid fallback now uses `var(--vq-border)` (was `#888`).

**Verified clean:**
- **Token discipline** — no hard-coded hex for UI chrome in web JSX/inline styles (only legitimate hex
  remains in canvas drawers — confetti / ambient-background / live-waveform / voice-orb / audio-hero —
  and SVG chart gradients, which read the viz language). Everything else is a `--token`.
- **Empty / loading / error** — every list/data page uses the `Crossfade` + `LoadingCard` /
  `ErrorState` / `EmptyState` pattern; charts + the notification feed ship their own empty states.
- **Overlays** — dialog / palette / tour / sheet are focus-trapped (Radix or explicit) with `aria-label`s;
  decorative SVGs/canvases are `aria-hidden`.

## 2. Accessibility

- **Automated (biome a11y)** — the lint suite (includes `lint/a11y/*`) is green across all packages; the
  only suppressions are justified (`role="dialog"`/`role="status"` on framer/animated elements that
  can't be native `<dialog>`/`<output>`, and `aria-hidden` on decorative pointer-events-none canvases).
- **Keyboard** — ⌘K palette (↑/↓/Enter/Esc), the `?` shortcuts overlay, roving-focus nav (Radix), and
  focus-visible rings across the component kit. Route changes move focus to the main region + announce
  via `aria-live` (RouteShell).
- **Contrast (AA)** — the theme engine's `readableForeground` guarantees a readable `-fg` on any brand
  colour (unit-tested against every preset); semantic `-fg`/`-subtle` tokens are AA in light + dark.
- **Reduced motion** — one seam (`useMotionLevel` + `[data-motion]`); every framer primitive + CSS
  keyframe degrades. Verified: `full` / `reduced` / `off` parity in the kitchen-sink and now across the
  remaining always-on animations.

## 3. Performance

- **Shared First Load JS: 177 kB** — held flat across the entire program (UX-00 → UX-16) despite adding
  the motion engine, voice-motion set, presence/ambient, the full component + chart kits, the theme
  engine, onboarding, and the delight layer.
- **Code-splitting** — heavy/optional weight lives on **subpath exports** loaded only where used:
  `@vocaliq/ui/motion` (framer via LazyMotion `domMax`), `/voice` (canvas + orb), `/charts` (SVG viz).
  Overlays (dialog/palette/tour/notifications) render nothing until opened.
- **No new heavy deps** — charts are **zero-dep SVG** (no Recharts); sound is **synthesised Web Audio**
  (no audio files); confetti/ambient are capped, rAF-cleaned, and IntersectionObserver/visibility-gated.
- **CLS** — animations are transform/opacity/height only; charts + sections reserve height → no layout
  shift. **INP** — nav is unchanged work + a cheap crossfade; the route-progress bar is a CSS cue.

## 4. Cross-theme regression

- All 8 presets (nebula/aurora/sunset/mono/ocean/grape/forest/contrast) + custom colours resolve through
  `resolveTheme` → `themeToCssVars` (50–900 ramps + AA `-fg`), applied on `:root` by `ThemeApplier`.
  Because every screen reads tokens (not hex), switching preset/mode/radius/density re-skins everything
  live — verified via the ⌘K "Theme" cycle + the Appearance studio's live preview.

## 5. The gate (run before every UI release)

```
pnpm typecheck && pnpm lint && pnpm test && NEXT_DIST_DIR=.next.nosync pnpm build
```
Current: **typecheck 12/12 · lint 12/12 · test green (api 463 · shared 700 · workers 42 · db 7 ·
provider-router 22) · build 8/8 (65/65 pages) · shared First Load JS 177 kB.**

## Manual pre-release checklist

- [ ] Each core screen at mobile / tablet / desktop, light + dark, 2–3 presets — no overflow/misalign.
- [ ] Tab through the overview, agents, calls, appearance — focus order sane, rings visible, no traps.
- [ ] `data-motion=off` (Appearance → Motion → Off) — nothing moves; all content still present.
- [ ] Screen-reader spot check: nav landmarks, route announce, table captions, dialog labels.
- [ ] Lighthouse on `/dashboard` + `/` — LCP < 2.5s, CLS < 0.1, INP < 200ms.
