import * as Sentry from '@sentry/nextjs';

/**
 * Next.js instrumentation hook. Loads the right Sentry config per runtime; each
 * config no-ops when SENTRY_DSN is unset, so the app boots fine without it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
