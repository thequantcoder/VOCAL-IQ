/**
 * @vocaliq/ui/motion — the motion engine + primitives (UX-01). Import from here (never `framer-motion`
 * directly) so reduced-motion / motion-off is honoured everywhere and the bundle stays lean (LazyMotion).
 */
export { MotionProvider, useMotionLevel, type MotionLevel } from './provider';
export {
  Reveal,
  Fade,
  Pop,
  Stagger,
  StaggerItem,
  PageTransition,
  RouteTransition,
  Crossfade,
  Collapse,
} from './primitives';
export { AnimatedNumber } from './animated-number';
export { DUR, EASE, SPRING, STAGGER_STEP } from './tokens';
// Escape hatch for bespoke animations — the strict LazyMotion `m` + presence.
export { m, AnimatePresence } from 'framer-motion';
