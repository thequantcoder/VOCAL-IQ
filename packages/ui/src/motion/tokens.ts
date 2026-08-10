/**
 * Framer-native motion tokens (UX-01) — mirror the design tokens in DESIGN-SYSTEM §11 / @vocaliq/shared
 * `theme.ts`, but in framer's units (seconds + cubic-bezier arrays + spring configs). The single source
 * for JS animations so durations/easings stay consistent across every primitive.
 */

/** Durations in seconds. */
export const DUR = { fast: 0.12, base: 0.22, slow: 0.38, slower: 0.56 } as const;

/** The house ease (calm, decisive) + variants, as cubic-bezier arrays. */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.4, 0, 1, 1],
  emphasized: [0.2, 0, 0, 1],
} as const;

/** Spring presets (framer transition shape) for interactive/gesture surfaces. */
export const SPRING = {
  soft: { type: 'spring', stiffness: 210, damping: 26, mass: 1 },
  snappy: { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 },
  bouncy: { type: 'spring', stiffness: 320, damping: 18, mass: 1 },
} as const;

/** Seconds between staggered children. */
export const STAGGER_STEP = 0.045;
