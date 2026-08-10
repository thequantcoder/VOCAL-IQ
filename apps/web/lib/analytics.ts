import posthog from 'posthog-js';

/**
 * PostHog product analytics — initialised once on the client. No-ops cleanly when
 * `NEXT_PUBLIC_POSTHOG_KEY` is absent (local/dev), so the app never depends on it
 * (DESIGN-SYSTEM §7 resilience; CLAUDE.md §5 — degrade gracefully).
 */
let started = false;

export function initPostHog(): void {
  if (started || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // no key → analytics disabled, app fully functional

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    capture_pageview: true,
    persistence: 'localStorage+cookie',
  });
  started = true;
}

/** Track a product event (e.g. a landing CTA). No-ops cleanly when PostHog isn't configured. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!started || typeof window === 'undefined') return;
  posthog.capture(event, props);
}
