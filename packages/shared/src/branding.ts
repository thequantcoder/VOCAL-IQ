import { z } from 'zod';

/**
 * Per-tenant white-label branding (Day 52, DESIGN-SYSTEM §8). A tenant's branding drives the
 * design-token CSS variables (`--vq-violet` primary, `--vq-cyan` accent) so the WHOLE UI
 * re-themes for a reseller's customers — light + dark — plus logo/name/favicon and a switch to
 * hide the platform ("VocalIQ") identity. Kept pure so the token mapping is deterministic +
 * unit-tested; the web injects the returned CSS vars at the root (self-audit H).
 */

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex colour like #7c5cff');

export const brandingSchema = z.object({
  /** Display name shown in the shell (defaults to "VocalIQ" when unset + not hidden). */
  name: z.string().max(60).optional(),
  logoUrl: z.string().url().max(500).optional(),
  faviconUrl: z.string().url().max(500).optional(),
  primaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  /** White-label: hide the "VocalIQ" platform identity for a reseller's customers. */
  hidePlatformName: z.boolean().default(false),
  /**
   * Pin brand colours (UX-12): when true, this tenant's users can't override the brand
   * primary/accent — they may still change radius/density/motion/mode/font.
   */
  lockBranding: z.boolean().default(false),
});
export type Branding = z.infer<typeof brandingSchema>;

/** Parse loosely-typed stored branding into a validated object (bad fields dropped → defaults). */
export function parseBranding(raw: unknown): Branding {
  const parsed = brandingSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : brandingSchema.parse({});
}

/**
 * Map branding to the CSS custom properties that re-theme the app. Only set colours produce an
 * override (unset → the default token stays), and `--vq-violet-deep` is derived from the primary
 * so gradients/hover states stay coherent. These vars flow into every `bg-vq-*`/`text-vq-*`
 * utility via the Tailwind theme, so one injection re-brands the entire surface.
 */
export function brandingToCssVars(branding: Branding): Record<string, string> {
  const vars: Record<string, string> = {};
  if (branding.primaryColor) {
    vars['--vq-violet'] = branding.primaryColor;
    vars['--vq-violet-deep'] = darken(branding.primaryColor, 0.2);
    vars['--ring'] = branding.primaryColor;
  }
  if (branding.accentColor) vars['--vq-cyan'] = branding.accentColor;
  return vars;
}

/** The name to show in the UI: the tenant's brand, or "VocalIQ" unless the platform is hidden. */
export function brandName(branding: Branding): string {
  if (branding.name) return branding.name;
  return branding.hidePlatformName ? '' : 'VocalIQ';
}

// ── colour helper ──────────────────────────────────────────────────────────────

/** Darken a #rrggbb / #rgb hex by `amount` (0..1). Pure; used to derive the deep-violet token. */
export function darken(hex: string, amount: number): string {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex;
  const n = Number.parseInt(full.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 0xff) * (1 - amount));
  const g = clamp(((n >> 8) & 0xff) * (1 - amount));
  const b = clamp((n & 0xff) * (1 - amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
