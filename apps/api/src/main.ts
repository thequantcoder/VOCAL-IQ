import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { parseEnv } from '@vocaliq/shared';
import { config as loadDotenv } from 'dotenv';

// Secrets live in the monorepo root .env (one source of truth). Load it before any
// env is read. Missing file is a no-op (e.g. CI provides env directly).
loadDotenv({ path: resolve(process.cwd(), '../../.env') });
import { AppExceptionFilter } from './app-exception.filter';
import { AppModule } from './app.module';
import { initSentry, shutdownObservability } from './observability';

/** Validate env at boot (fail-fast), then start the app API. */
async function bootstrap(): Promise<void> {
  // Sentry must initialise before the app so its instrumentation attaches.
  initSentry();
  const env = parseEnv();
  // rawBody: true exposes req.rawBody so webhook signatures verify over the exact
  // bytes Clerk/Svix signed (CODE-PATTERNS §4), not the re-serialised JSON.
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    rawBody: true,
  });
  // One boundary turns every thrown error into the safe ErrorResponse envelope.
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableShutdownHooks();
  const port = env.API_PORT;
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdownObservability().finally(() => process.exit(0));
    });
  }
}

void bootstrap();
