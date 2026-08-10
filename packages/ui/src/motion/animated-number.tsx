'use client';

import { useEffect, useRef, useState } from 'react';
import { useMotionLevel } from './provider';

/**
 * Count-up number (UX-01) — animates from its previous value to the new one with easeOutCubic via
 * requestAnimationFrame (no layout thrash). Honours motion level: `off` → sets instantly. Optional
 * `format` for currency/percent/etc. Used by KPI/metric cards (UX-09/10).
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 800,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const { animate } = useMotionLevel();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!animate) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, animate, durationMs]);

  const text = format ? format(display) : Math.round(display).toLocaleString();
  return (
    <span className={className} aria-label={format ? format(value) : String(value)}>
      {text}
    </span>
  );
}
