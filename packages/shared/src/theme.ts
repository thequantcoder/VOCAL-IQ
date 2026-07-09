import { z } from 'zod';

/**
 * UI/UX Elevation Program — theme + motion CONTRACTS (UX-00). These are the shared type contracts the
 * later UX-Days implement: the motion-level, the per-user theme config, the preset catalogue, and the
 * design-only motion tokens. Kept pure + dependency-light (a zod schema for validation + plain
 * constants) so both api (persist/validate) and web (apply) speak the same language.
 *
 * NOTE: this file defines the CONTRACT + design tokens only. The runtime that resolves a theme into
 * CSS variables (`resolveTheme`, `ThemeApplier`) and the motion engine land in UX-01/02/12 — nothing
 * here changes the live UI yet.
 */

// ── Motion ─────────────────────────────────────────────────────────────────────

/** How much motion a user wants. Seeds from `prefers-reduced-motion`; user-overridable (UX-01/13). */
export const MOTION_LEVELS = ['full', 'reduced', 'off'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/** Named motion durations (ms) — mirror the CSS `--dur-*` tokens; the single source for JS animations. */
export const MOTION_DURATIONS = {
  instant: 0,
  fast: 120,
  base: 220,
  slow: 380,
  slower: 560,
} as const;
export type MotionDuration = keyof typeof MOTION_DURATIONS;

/** Named easings (CSS cubic-bezier strings) — `out` is the house ease (calm, decisive). */
export const MOTION_EASINGS = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;
export type MotionEasing = keyof typeof MOTION_EASINGS;

/** Spring presets (framer-motion transition shape) — for interactive/gesture surfaces (UX-01). */
export const MOTION_SPRINGS = {
  soft: { type: 'spring', stiffness: 210, damping: 26, mass: 1 },
  snappy: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 },
  bouncy: { type: 'spring', stiffness: 320, damping: 18, mass: 1 },
} as const;
export type MotionSpring = keyof typeof MOTION_SPRINGS;

/** Seconds between staggered children (list/grid entrances). */
export const STAGGER_STEP = 0.045;

/** The motion taxonomy every animation should map to (documented in DESIGN-SYSTEM §11). */
export const MOTION_KINDS = ['enter', 'exit', 'state', 'feedback', 'ambient'] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

// ── Theme ──────────────────────────────────────────────────────────────────────

export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

/** Corner-radius character. Maps to the `--radius-*` scale at runtime (UX-02). */
export const RADII = ['sharp', 'soft', 'round'] as const;
export type ThemeRadius = (typeof RADII)[number];

/** Spacing/size density — scales paddings + control heights via a `--density` multiplier (UX-02). */
export const DENSITIES = ['comfortable', 'cozy', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

/** Display/body font pairing choice (UX-02/13). */
export const FONTS = ['sans', 'grotesk', 'rounded', 'mono'] as const;
export type ThemeFont = (typeof FONTS)[number];

/** Built-in theme presets — each ships light + dark, all AA-verified (implemented UX-12). */
export const THEME_PRESETS = [
  'nebula', // default — violet / cyan (today's brand)
  'aurora', // teal / green
  'sunset', // amber / rose
  'mono', // neutral / ink
  'ocean', // blue / cyan
  'grape', // purple / magenta
  'forest', // green / lime
  'contrast', // high-contrast accessibility
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex colour like #7c5cff');

/** Optional custom color overrides layered on top of the chosen preset (UX-12). */
export const themeColorsSchema = z.object({
  primary: hexColor.optional(),
  secondary: hexColor.optional(),
  accent: hexColor.optional(),
});
export type ThemeColors = z.infer<typeof themeColorsSchema>;

/**
 * The per-user theme configuration (UX-12/13). Resolution order at runtime:
 * platform default → reseller white-label ([[branding]]) → this per-user config.
 */
export const themeConfigSchema = z.object({
  preset: z.enum(THEME_PRESETS).default('nebula'),
  mode: z.enum(COLOR_MODES).default('system'),
  colors: themeColorsSchema.default({}),
  radius: z.enum(RADII).default('soft'),
  density: z.enum(DENSITIES).default('comfortable'),
  motion: z.enum(MOTION_LEVELS).default('full'),
  font: z.enum(FONTS).default('sans'),
});
export type ThemeConfig = z.infer<typeof themeConfigSchema>;

/** The platform default theme (the current VocalIQ look). */
export const DEFAULT_THEME: ThemeConfig = themeConfigSchema.parse({});

/** Preset base swatches (design reference for UX-12's ramp generation + UX-13's gallery previews). */
export const THEME_PRESET_SWATCHES: Record<ThemePreset, { primary: string; accent: string }> = {
  nebula: { primary: '#7c5cff', accent: '#22d3ee' },
  aurora: { primary: '#14b8a6', accent: '#34d399' },
  sunset: { primary: '#f59e0b', accent: '#fb7185' },
  mono: { primary: '#4b5563', accent: '#a1a1aa' },
  ocean: { primary: '#3b82f6', accent: '#22d3ee' },
  grape: { primary: '#a855f7', accent: '#ec4899' },
  forest: { primary: '#22c55e', accent: '#84cc16' },
  contrast: { primary: '#111827', accent: '#2563eb' },
};

/** Parse loosely-typed stored theme into a validated config (bad fields → defaults). Pure. */
export function parseThemeConfig(raw: unknown): ThemeConfig {
  const parsed = themeConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_THEME;
}
