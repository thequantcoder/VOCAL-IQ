'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type VTDoc = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished?: Promise<void> };
};

/** View Transitions API available AND the user hasn't asked for reduced motion. */
function canViewTransition(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof (document as VTDoc).startViewTransition !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Navigate with the browser View Transitions API when supported (a native crossfade + shared-element
 * morph via matching `view-transition-name`s); otherwise a plain client push — the framer `RouteTransition`
 * covers the animation there. Pure progressive enhancement: feature-detected, reduced-motion-aware, and
 * never required for navigation to work.
 */
export function useViewTransitionRouter() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      const doc = document as VTDoc;
      if (!canViewTransition() || !doc.startViewTransition) {
        router.push(href);
        return;
      }
      doc.startViewTransition(() => {
        router.push(href);
        // Give React a couple of frames to commit the new route before the API captures the
        // "after" snapshot — the pragmatic App-Router VT pattern (no experimental flag needed).
        return new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      });
    },
    [router],
  );
}
