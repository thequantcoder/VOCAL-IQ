'use client';

import { RouteTransition } from '@vocaliq/ui/motion';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

/** Title-case the last meaningful path segment for the screen-reader announcement. */
function routeLabel(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean);
  // Prefer the last non-id-looking segment (ids are long/hex-ish).
  const meaningful = [...segs].reverse().find((s) => s.length < 20 && !/^[0-9a-f-]{16,}$/i.test(s));
  const raw = meaningful ?? segs[segs.length - 1] ?? 'dashboard';
  const name = raw.replace(/-/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Route-change UX (UX-06). Wraps page content in the framer `RouteTransition` (enter/exit crossfade) and,
 * on every navigation, manages accessibility: announces the new route to screen readers via an
 * `aria-live` region, moves focus to the main content region, and resets scroll to the top. The View
 * Transitions API (when supported, via `useViewTransitionRouter`) drives the visual crossfade; this
 * framer path is the universal, reduced-motion-safe fallback.
 */
export function RouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const liveRef = useRef<HTMLParagraphElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial mount — only react to real navigations.
    if (first.current) {
      first.current = false;
      return;
    }
    if (liveRef.current) liveRef.current.textContent = `${routeLabel(pathname)} — page loaded`;
    // Land focus at the top of the freshly-rendered page (a11y) without yanking scroll.
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <>
      <p ref={liveRef} aria-live="assertive" role="status" className="sr-only" />
      <div ref={mainRef} tabIndex={-1} className="outline-none">
        <RouteTransition routeKey={pathname}>{children}</RouteTransition>
      </div>
    </>
  );
}
