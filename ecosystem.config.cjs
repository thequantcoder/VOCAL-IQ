/**
 * PM2 process manager config for self-hosting VocalIQ (CodeCanyon self-hosted deploy).
 * Run all long-lived services on your own server with:  `pm2 start ecosystem.config.cjs`
 *
 * Prereqs: `pnpm install && pnpm build` (TS apps compiled to dist/), Python venv for the
 * voice service, and a filled-in root `.env`. See docs/SELF-HOSTING.md.
 *
 * Everything here is free & open-source — no paid process manager or orchestrator needed.
 */
module.exports = {
  apps: [
    {
      name: 'vocaliq-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'vocaliq-workers',
      cwd: './apps/workers',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'vocaliq-web',
      cwd: './apps/web',
      // Next.js production server (self-hosted, behind Nginx). No Vercel required.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'vocaliq-voice',
      cwd: './apps/voice',
      // Python real-time voice service (FastAPI + Uvicorn) via the venv interpreter.
      script: '.venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      autorestart: true,
      max_memory_restart: '768M',
    },
  ],
};
