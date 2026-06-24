import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseEnv } from '@vocaliq/shared';
import { AppModule } from './app.module';

/** Validate env at boot (fail-fast), then start the app API. */
async function bootstrap(): Promise<void> {
  parseEnv();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

void bootstrap();
