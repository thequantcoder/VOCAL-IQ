'use client';

import { type HTMLMotionProps, m, useMotionValue, useSpring } from 'framer-motion';
import { type ReactNode, useRef, useState } from 'react';
import { useMotionLevel } from '../motion/provider';
import { type ButtonSize, type ButtonVariant, buttonClasses } from './button';

/**
 * MagneticButton (UX-08) — a hero-CTA button with JS-driven delight: a subtle magnetic pull toward the
 * cursor (spring), a press scale, and a ripple from the click point. Shares the exact `Button` styling
 * via `buttonClasses`. Under reduced/off motion it degrades to a plain button (no magnet, no ripple).
 * Use sparingly — the single leading CTA on a hero/pricing/onboarding surface.
 */
export interface MagneticButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Magnet strength (0–1 of the offset from center). */
  strength?: number;
  children?: ReactNode;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function MagneticButton({
  variant = 'primary',
  size = 'lg',
  strength = 0.3,
  type = 'button',
  className,
  children,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  ...props
}: MagneticButtonProps) {
  const { animate } = useMotionLevel();
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 22, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 300, damping: 22, mass: 0.6 });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const counter = useRef(0);

  return (
    <m.button
      ref={ref}
      type={type}
      className={cnRelative(buttonClasses(variant, size, className))}
      {...(animate ? { style: { x: sx, y: sy }, whileTap: { scale: 0.96 } } : {})}
      onPointerMove={(e) => {
        if (animate && ref.current) {
          const r = ref.current.getBoundingClientRect();
          x.set((e.clientX - (r.left + r.width / 2)) * strength);
          y.set((e.clientY - (r.top + r.height / 2)) * strength);
        }
        onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        x.set(0);
        y.set(0);
        onPointerLeave?.(e);
      }}
      onPointerDown={(e) => {
        if (animate && ref.current) {
          const r = ref.current.getBoundingClientRect();
          const size = Math.max(r.width, r.height);
          const id = counter.current++;
          setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top, size }]);
          window.setTimeout(() => setRipples((rs) => rs.filter((rp) => rp.id !== id)), 600);
        }
        onPointerDown?.(e);
      }}
      {...props}
    >
      {ripples.map((rp) => (
        <span
          key={rp.id}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-white/40 motion-safe:animate-[vq-ripple_600ms_var(--ease-out-soft)_forwards]"
          style={{
            left: rp.x - rp.size / 2,
            top: rp.y - rp.size / 2,
            width: rp.size,
            height: rp.size,
          }}
        />
      ))}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </m.button>
  );
}

/** Ensure the styling string keeps `overflow-hidden` so ripples are clipped to the button. */
function cnRelative(classes: string): string {
  return classes.includes('overflow-hidden') ? classes : `${classes} overflow-hidden`;
}
