# UX-CONTRIBUTING.md — How to add an animated, themed, accessible screen

> The contributor guide for building UI on the VocalIQ design system (the output of the UI/UX Elevation
> program). Follow this and your screen is themed, animated, accessible, and reduced-motion-safe by
> default. Companion docs: `DESIGN-SYSTEM.md` (identity + tokens), `DATAVIZ.md` (charts), `UX-QA.md`
> (the release gate).

## 1. Compose from the kit — don't reinvent

Import primitives; never hand-roll a button/dialog/chart.

```ts
import { Button, Card, Badge, Dialog, SegmentedControl, EmptyState, AgentAvatar } from '@vocaliq/ui';
import { Reveal, Stagger, StaggerItem, useMotionLevel } from '@vocaliq/ui/motion';
import { StatCard, AreaTrend, Sparkline } from '@vocaliq/ui/charts';
import { VoiceOrb, LiveWaveform } from '@vocaliq/ui/voice';
```

Heavy weight (framer, canvas, viz) lives on **subpath exports** so it code-splits onto the routes that
use it — the shared First Load JS stays flat (177 kB). Keep it that way.

## 2. Colours = tokens, never hex

Use the UX-02 token utilities so the theme engine re-skins you for free:

- Brand: `bg-primary-500` · `text-accent-600` · `border-neutral-200` · `text-primary-fg`
- Semantic: `text-success` · `bg-warn-subtle` · `text-danger-fg`
- Data-viz: `bg-viz-3`, or pass `--viz-n` to a chart's `color` prop
- Surfaces/elevation/radius: `bg-vq-bg-elevated` · `shadow-elev-2` · `rounded-vq-card`

**Never** write a `#hex` for UI chrome — the only exception is a `<canvas>` drawer (it can't read CSS
vars). Everything token-driven is AA-verified in light + dark by the engine.

## 3. Animate through the motion seam

Wrap entrances in the motion primitives — they're reduced-motion-safe in one place:

```tsx
<Stagger className="grid gap-3">
  {items.map((it) => (
    <StaggerItem key={it.id}><Card>…</Card></StaggerItem>
  ))}
</Stagger>
```

For bespoke animation, read the level and gate:

```tsx
const { animate, subtle } = useMotionLevel();
// animate === false → render instant; subtle === true → fade only, no movement
```

Any custom CSS keyframe must be disabled under `[data-motion="off"]`/`"reduced"` (see `ui.css`) or gated
with `motion-safe:` / `motion-reduce:animate-none`. **The QA gate greps for unguarded `animate-*`.**

## 4. Handle the four async states

Never render raw query output. Use the shared states + a `Crossfade` so skeleton → data doesn't flash:

```tsx
<Crossfade swapKey={q.isLoading ? 'loading' : q.isError ? 'error' : !q.data?.length ? 'empty' : 'data'}>
  {q.isLoading ? <LoadingCard /> :
   q.isError   ? <ErrorState message={…} onRetry={…} /> :
   !q.data?.length ? <EmptyState illustration="no-agents" title="…" action={…} /> :
   <YourList data={q.data} />}
</Crossfade>
```

## 5. Accessibility is not optional

- Icon-only buttons get an `aria-label`; non-submit `<button>`s get `type="button"`.
- Tables get an `sr-only` `<caption>`; inputs get a `<label>` (or use `FormField`).
- Overlays use the kit's focus-trapped `Dialog`/`Popover`/`Sheet` (Radix) — don't build your own.
- Decorative SVG/canvas → `aria-hidden`. Every `role="…"` needs a matching `aria-label`.
- Keep focus-visible rings (`focus-visible:ring-2 focus-visible:ring-vq-ring`).

## 6. Infographics over flat numbers

A KPI = a `StatCard` (count-up + delta + sparkline + sentiment). A trend = `AreaTrend`/`LineSeries`. A
proportion = `DonutBreakdown`. Always give a number context (a `TrendDelta` or a `Sparkline`). See
`DATAVIZ.md`.

## 7. Before you open a PR

Run the gate and keep the streak:

```
pnpm typecheck && pnpm lint && pnpm test && NEXT_DIST_DIR=.next.nosync pnpm build
```

Then eyeball your screen at mobile/desktop, in light + dark, with **Motion → Off** (Appearance) — if it
still reads and nothing overflows, ship it.
