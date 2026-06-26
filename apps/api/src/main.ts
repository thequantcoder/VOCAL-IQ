import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseEnv } from '@vocaliq/shared';
import { AppExceptionFilter } from './app-exception.filter';
import { AppModule } from './app.module';
import { initSentry, shutdownObservability } from './observability';

/** Validate env at boot (fail-fast), then start the app API. */
async function bootstrap(): Promise<void> {
  // Sentry must initialise before the app so its instrumentation attaches.
  initSentry();
  const env = parseEnv();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
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
