import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';

// Load secrets from the monorepo root .env (one source of truth) before Next reads
// NEXT_PUBLIC_* / server env. Missing file is a no-op (e.g. CI / Vercel set env directly).
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vocaliq/ui'],
  // Build output dir. Defaults to `.next`; set NEXT_DIST_DIR (e.g. `.next.nosync`) when developing
  // under an iCloud-synced folder so macOS doesn't evict build chunks out from under `next start`
  // (which surfaces as 400s on /_next/static/*). No-op in CI/prod (env unset → `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
