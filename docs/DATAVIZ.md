# DATAVIZ.md — VocalIQ Data-Viz Kit (`@vocaliq/ui/charts`)

> The zero-dep, themed, animated infographic kit (UX-09). **Pure SVG/CSS — no Recharts** (matches the
> existing chart approach + keeps the shared bundle flat). Every piece reads the UX-02 **viz tokens**
> (`--viz-1…8`, semantic `--success/warn/danger`, `--primary-500`) and is **reduced-motion-safe**
> (animations gate on `data-motion`). Import from the subpath so viz code stays off the shared bundle:
>
> ```ts
> import { StatCard, RadialGauge, AreaTrend, DonutBreakdown } from '@vocaliq/ui/charts';
> ```

Live gallery: `/dashboard/kitchen` → **Data-viz & infographics** + **Charts & distribution** (dev only).

---

## When to use what

| Need | Component |
|------|-----------|
| A KPI number with context | `StatCard` (count-up + delta + sparkline + sentiment glow) |
| Inline trend in a row/card | `Sparkline` |
| A single 0–100 metric | `RadialGauge` (success rate, sentiment, health) |
| Usage vs a limit/quota | `Meter` (bullet, zone-coloured, optional target) |
| Change vs last period | `TrendDelta` (▲/▼, `invert` for down-is-good) |
| A trend over time | `AreaTrend` (single) · `LineSeries` (multi + legend) |
| Compare categories | `BarSeries` · `StackedBar` (segmented) |
| Proportions of a whole | `DonutBreakdown` (centre total + legend) |
| Volume by day × hour | `Heatmap` |
| Sentiment across a call | `SentimentRibbon` |

---

## Core primitives (UX-09a)

- **`StatCard`** — `{ label, value, format?, delta?, deltaInvert?, spark?, sentiment? }`. `sentiment`
  (`good | bad | neutral`) drives the glow + sparkline colour. Value counts up via `<AnimatedNumber>`.
- **`Sparkline`** — `{ data: number[], color?, area?, width?, height?, label? }`. `color` accepts any
  `--viz-n`. Draws in via a length-independent `pathLength` trick.
- **`RadialGauge`** — `{ value: 0–100, size?, color?, label?, children? }`. Auto-colours by threshold
  (`<45` danger, `<75` warn, else success) unless `color` is set.
- **`Meter`** — `{ value, max, target?, label?, showValue? }`. Zone colours (primary → amber ≥85% →
  red ≥100%); `target` renders a goal tick.
- **`TrendDelta`** — `{ value: percent, invert? }`. Green up / red down; `invert` for cost/latency.

## Charts + distribution (UX-09b)

- **`AreaTrend`** — `{ data: number[], labels?, color?, format?, height?, label? }`. Gradient area +
  line, hover crosshair + tooltip, empty state. Responsive (ResizeObserver).
- **`BarSeries`** — `{ data: {label,value}[], color?, format?, height? }`. Grow-in bars, hover
  highlight + tooltip, x labels (≤16).
- **`LineSeries`** — `{ series: {label,data,color?}[], height? }`. Shared min/max so lines compare;
  legend; staggered draw-in.
- **`StackedBar`** — `{ data: {label,values}[], keys: string[], colors?, height? }`. Segmented bars +
  legend; native `<title>` per segment.
- **`DonutBreakdown`** — `{ data: {label,value,color?}[], centerLabel?, size?, thickness?, format? }`.
  Centre shows the total (or the hovered slice); legend with percentages.
- **`Heatmap`** — `{ matrix: number[][], rows, cols, color?, format? }`. Cell opacity ∝ value/max;
  native `<title>` tooltips.
- **`SentimentRibbon`** — `{ points: {score: -1..1, label?}[], height? }`. Green/grey/red by score,
  tinted by magnitude.

`VIZ_COLORS` (the categorical palette) and `LegendItem` are exported for custom compositions.

---

## Rules

1. **Always pass tokens, never hex.** Use `--viz-n` / semantic tokens so charts re-skin with the theme
   engine (UX-12) and pass AA in both light + dark.
2. **Reduced motion is automatic** — draws/grows/sweeps gate on `data-motion`; never add your own
   always-on animation.
3. **Give every number context** — pair a value with a `TrendDelta` (vs last period) or a `Sparkline`.
4. **Empty states are built in** — charts render a "No data yet." placeholder for empty input; don't
   guard upstream.
5. **Import from `@vocaliq/ui/charts`** (the subpath), not the main barrel — keeps viz weight off the
   shared bundle.
