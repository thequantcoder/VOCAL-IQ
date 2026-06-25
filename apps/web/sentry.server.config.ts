import * as Sentry from '@sentry/nextjs';

/** Server-side Sentry. No DSN → no init, so local/dev runs without it. */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}
