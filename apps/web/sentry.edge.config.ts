import * as Sentry from '@sentry/nextjs';

/** Edge-runtime Sentry. No DSN → no init. */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}
