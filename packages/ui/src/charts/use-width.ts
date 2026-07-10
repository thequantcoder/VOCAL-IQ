'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Measure the container width (UX-09b) so SVG charts render crisp at the real pixel width (correct
 * strokes, pixel-accurate hover) and reflow responsively. Returns a ref for the wrapper + the current
 * width (defaults to 600 until measured, so SSR + first paint are sensible).
 */
export function useWidth(initial = 600) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && Math.abs(w - width) > 1) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return [ref, Math.max(120, width)] as const;
}
