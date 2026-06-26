import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load the monorepo-root .env in the main process so test workers inherit DB/Clerk
// env. In CI the env is set on the job, so a missing file is a harmless no-op.
loadDotenv({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  test: {
    // Integration tests hit a real Postgres; keep them serial-ish and patient.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
