import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config (Day 14). Runs locally against a built app — NOT wired into the
 * CI `test` pipeline (no browser install there), so the gate stays deterministic. The
 * full authenticated journey (sign up → create agent → place test call → transcript+cost)
 * needs a seeded test user + the api/db running; the smoke below covers the public shell.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
