'use client';

import { type MotionStyle, m } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { useMotionLevel } from './provider';
import { DUR, EASE, STAGGER_STEP } from './tokens';

/**
 * Motion primitives (UX-01). Every animated surface in the app composes from these — never
 * `framer-motion` directly — so reduced-motion / motion-off is honoured in ONE place: `!animate` →
 * render plain (instant); `subtle` (reduced) → fade only, no movement/scale. These are layout/entrance
 * wrappers: they take `className` + `style` + children (put interactive props on the inner elements).
 */

interface BaseProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Fade + rise on mount. The default "content appears" entrance. */
export function Reveal({
  children,
  className,
  style,
  delay = 0,
  y = 12,
}: BaseProps & { delay?: number; y?: number }) {
  const { animate, subtle } = useMotionLevel();
  if (!animate)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <m.div
      className={className}
      style={style as MotionStyle}
      initial={{ opacity: 0, y: subtle ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.out, delay }}
    >
      {children}
    </m.div>
  );
}

/** Opacity-only fade — safe at every motion level. */
export function Fade({ children, className, style, delay = 0 }: BaseProps & { delay?: number }) {
  const { animate } = useMotionLevel();
  if (!animate)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <m.div
      className={className}
      style={style as MotionStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.base, ease: EASE.out, delay }}
    >
      {children}
    </m.div>
  );
}

/** Scale-in pop — for cards/badges/modals appearing. Reduced → fade only. */
export function Pop({ children, className, style, delay = 0 }: BaseProps & { delay?: number }) {
  const { animate, subtle } = useMotionLevel();
  if (!animate)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <m.div
      className={className}
      style={style as MotionStyle}
      initial={{ opacity: 0, scale: subtle ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.base, ease: EASE.out, delay }}
    >
      {children}
    </m.div>
  );
}

/** Parent that staggers its `<StaggerItem>` children in on mount. */
export function Stagger({
  children,
  className,
  style,
  step = STAGGER_STEP,
}: BaseProps & { step?: number }) {
  const { animate } = useMotionLevel();
  if (!animate)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <m.div
      className={className}
      style={style as MotionStyle}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: step } } }}
    >
      {children}
    </m.div>
  );
}

/** A child of `<Stagger>` — fades/rises in on its stagger tick. */
export function StaggerItem({ children, className, style, y = 10 }: BaseProps & { y?: number }) {
  const { animate, subtle } = useMotionLevel();
  if (!animate)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  return (
    <m.div
      className={className}
      style={style as MotionStyle}
      variants={{
        hidden: { opacity: 0, y: subtle ? 0 : y },
        show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
      }}
    >
      {children}
    </m.div>
  );
}

/** Page-content entrance wrapper (used in the dashboard shell; full route transitions land in UX-06). */
export function PageTransition({ children, className }: BaseProps) {
  const { animate, subtle } = useMotionLevel();
  if (!animate) return <div className={className}>{children}</div>;
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: subtle ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      {children}
    </m.div>
  );
}

/**
 * Smoothly show/hide content by height. Uses the CSS grid-rows technique (0fr↔1fr) so it's cheap +
 * layout-safe; `[data-motion="off"]` (via the provider) removes the transition automatically.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="vq-collapse"
      data-open={open || undefined}
      aria-hidden={!open}
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--dur-base, 220ms) var(--ease-out-soft, ease)',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  );
}
