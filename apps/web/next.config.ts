import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';

// Load secrets from the monorepo root .env (one source of truth) before Next reads
// NEXT_PUBLIC_* / server env. Missing file is a no-op (e.g. CI / Vercel set env directly).
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@vocaliq/ui'],
};

export default nextConfig;
