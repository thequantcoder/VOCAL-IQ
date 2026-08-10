'use client';

import { useMotionLevel } from '@vocaliq/ui/motion';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Route progress bar (UX-15) — a slim cyan bar pinned to the top of the viewport that plays a quick
 * fill on each navigation, giving the premium "something's loading" cue. App-Router client nav is fast,
 * so this is a tasteful ~450ms fill-then-fade keyed on the pathname (not a real loading meter). Off
 * under reduced/off motion.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const { animate } = useMotionLevel();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const first = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger — it fires the bar on nav.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!animate) return;

    let raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setVisible(true);
    setProgress(0);
    raf = requestAnimationFrame(() => setProgress(80));
    timers.push(setTimeout(() => setProgress(100), 300));
    timers.push(
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 550),
    );
    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
    };
  }, [pathname, animate]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[150] h-0.5" aria-hidden>
      <div
        className="h-full bg-accent-500 transition-[width,opacity] duration-300 ease-[var(--ease-out-soft)]"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
