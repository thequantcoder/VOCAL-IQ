import * as Sentry from '@sentry/nextjs';

/** Client-side Sentry. No public DSN → no init (local/dev safe). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
