import {
  type ColorMode,
  DEFAULT_THEME,
  type Density,
  type MotionLevel,
  THEME_PRESET_SWATCHES,
  type ThemeConfig,
  type ThemeFont,
  type ThemePreset,
  type ThemeRadius,
} from './theme.js';

/**
 * Theme engine runtime (UX-12) — pure colour maths + resolution. Turns a chosen base palette into the
 * full UX-02 token set (50–900 ramps + AA-safe `-fg`), and resolves the platform → reseller → per-user
 * hierarchy. No DOM, no React — so it's unit-testable and shared by api (validate) + web (apply).
 */

// ── Colour maths ─────────────────────────────────────────────────────────────

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [hue(hn + 1 / 3) * 255, hue(hn) * 255, hue(hn - 1 / 3) * 255];
}

function channelLin(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0..1). */
export function luminance(rgb: RGB): number {
  return 0.2126 * channelLin(rgb[0]) + 0.7152 * channelLin(rgb[1]) + 0.0722 * channelLin(rgb[2]);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: RGB = [255, 255, 255];

/**
 * AA guardrail — the readable foreground (white or near-black ink) for a given background hex. Prefers
 * white (the brand convention) and only falls back to dark ink when white wouldn't clear the 3:1
 * large-text/UI threshold (i.e. on light colours like cyan / amber / grey). Ink is always the higher-
 * contrast fallback in that case, so the result is always readable.
 */
export function readableForeground(bgHex: string): string {
  return contrastRatio(hexToRgb(bgHex), WHITE) >= 3 ? '#ffffff' : '#0b0b12';
}

// ── Ramp generation ──────────────────────────────────────────────────────────

export const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
// Fixed perceptual lightness per step + a saturation falloff at the extremes.
const RAMP_L = [0.965, 0.925, 0.855, 0.77, 0.675, 0.585, 0.5, 0.42, 0.33, 0.24];
const RAMP_S = [0.5, 0.66, 0.8, 0.9, 0.97, 1, 1, 0.98, 0.92, 0.85];

/**
 * Generate a 50–900 ramp from a base colour (the base sits at 500, kept exact so the brand hue is
 * recognisable). Other steps derive from the base hue with fixed lightness targets + a saturation
 * falloff — so any user colour yields a coherent, evenly-stepped scale.
 */
export function ramp(baseHex: string): Record<number, string> {
  const [h, s] = rgbToHsl(hexToRgb(baseHex));
  const out: Record<number, string> = {};
  RAMP_STEPS.forEach((step, i) => {
    if (step === 500) {
      out[step] = baseHex.toLowerCase();
      return;
    }
    out[step] = rgbToHex(hslToRgb([h, Math.min(1, s * (RAMP_S[i] ?? 1)), RAMP_L[i] ?? 0.5]));
  });
  return out;
}

// ── Resolution hierarchy ─────────────────────────────────────────────────────

/** Reseller white-label input (a subset of Day-52 branding relevant to colour). */
export interface ResellerBranding {
  primary?: string;
  secondary?: string;
  accent?: string;
  /** Pin brand colours: the user may still change radius/density/motion/mode/font, not colours. */
  lockBranding?: boolean;
}

/** The effective, resolved theme — base colours + the non-colour prefs. */
export interface ResolvedTheme {
  preset: ThemePreset;
  primary: string;
  secondary: string;
  accent: string;
  radius: ThemeRadius;
  density: Density;
  mode: ColorMode;
  motion: MotionLevel;
  font: ThemeFont;
}

/** A secondary hue for each preset (bridges primary → accent); presets only ship primary+accent. */
const PRESET_SECONDARY: Record<ThemePreset, string> = {
  nebula: '#6366f1',
  aurora: '#0ea5e9',
  sunset: '#f97316',
  mono: '#6b7280',
  ocean: '#6366f1',
  grape: '#c026d3',
  forest: '#16a34a',
  contrast: '#1d4ed8',
};

/**
 * Resolve the effective theme: **platform default → reseller white-label → per-user**. Base colours
 * start from the preset, are overridden by the reseller, then by the user — UNLESS the reseller sets
 * `lockBranding`, in which case reseller colours are pinned (user colour overrides are ignored) while
 * the user keeps radius / density / motion / mode / font. Pure.
 */
export function resolveTheme(input: {
  user?: Partial<ThemeConfig>;
  reseller?: ResellerBranding;
  platformDefault?: ThemeConfig;
}): ResolvedTheme {
  const base = input.platformDefault ?? DEFAULT_THEME;
  const user = input.user ?? {};
  const reseller = input.reseller ?? {};
  const lock = reseller.lockBranding === true;

  const preset = (user.preset ?? base.preset) as ThemePreset;
  const swatch = THEME_PRESET_SWATCHES[preset];

  // Colours: preset → reseller → user (user skipped when branding is locked).
  const userColors = lock ? {} : (user.colors ?? {});
  const primary = userColors.primary ?? reseller.primary ?? swatch.primary;
  const accent = userColors.accent ?? reseller.accent ?? swatch.accent;
  const secondary = userColors.secondary ?? reseller.secondary ?? PRESET_SECONDARY[preset];

  return {
    preset,
    primary,
    secondary,
    accent,
    radius: (user.radius ?? base.radius) as ThemeRadius,
    density: (user.density ?? base.density) as Density,
    mode: (user.mode ?? base.mode) as ColorMode,
    motion: (user.motion ?? base.motion) as MotionLevel,
    font: (user.font ?? base.font) as ThemeFont,
  };
}

// ── CSS variable generation ──────────────────────────────────────────────────

const RADIUS_REM: Record<ThemeRadius, { base: string; lg: string }> = {
  sharp: { base: '0.375rem', lg: '0.55rem' },
  soft: { base: '0.625rem', lg: '0.9rem' },
  round: { base: '1rem', lg: '1.35rem' },
};

const DENSITY_SCALE: Record<Density, string> = {
  comfortable: '1',
  cozy: '0.9',
  compact: '0.82',
};

function scaleVars(prefix: string, baseHex: string): Record<string, string> {
  const r = ramp(baseHex);
  const vars: Record<string, string> = {};
  for (const step of RAMP_STEPS) vars[`--${prefix}-${step}`] = r[step] as string;
  vars[`--${prefix}-fg`] = readableForeground(r[500] as string);
  return vars;
}

/**
 * Turn a resolved theme into the CSS custom properties the app writes on `:root` (the UX-02 token
 * layer). Themes the primary / secondary / accent scales (+ AA `-fg`), the radius, and the density —
 * mode-independent, so it re-skins in both light + dark (surfaces/text keep their `.dark` handling).
 * Semantic success/warn/danger + the `cyan = live` accent semantics are preserved.
 */
export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {
    ...scaleVars('primary', theme.primary),
    ...scaleVars('secondary', theme.secondary),
    ...scaleVars('accent', theme.accent),
    '--radius': RADIUS_REM[theme.radius].base,
    '--radius-lg': RADIUS_REM[theme.radius].lg,
    '--density': DENSITY_SCALE[theme.density],
  };
  // Back-compat aliases (the legacy `--vq-*` tokens still used across the app).
  vars['--vq-violet'] = vars['--primary-500'] as string;
  vars['--vq-cyan'] = vars['--accent-500'] as string;
  return vars;
}
