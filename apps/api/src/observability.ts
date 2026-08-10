import * as Sentry from '@sentry/node';
import { PostHog } from 'posthog-node';

/**
 * Observability bootstrap for the API. Both Sentry and PostHog no-op cleanly when
 * their keys are absent, so local/dev and CI run without them (CLAUDE.md §5 —
 * degrade gracefully; never make the app depend on optional infra).
 *
 * `initSentry()` must run BEFORE Nest is created so instrumentation hooks attach.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}

let posthog: PostHog | undefined;

/** Lazily build a PostHog client; returns undefined when no key is configured. */
export function getPostHog(): PostHog | undefined {
  if (posthog) return posthog;
  const key = process.env.POSTHOG_KEY;
  if (!key) return undefined;
  posthog = new PostHog(key, {
    host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
  return posthog;
}

/** Flush buffered analytics on shutdown so events aren't lost. */
export async function shutdownObservability(): Promise<void> {
  await posthog?.shutdown();
  await Sentry.flush(2000).catch(() => undefined);
}
