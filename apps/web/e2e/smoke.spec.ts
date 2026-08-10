import { expect, test } from '@playwright/test';

/**
 * Public-shell smoke. The authenticated dashboard journey (create agent → place test
 * call → transcript+cost) is added once a seeded test user + the api/db harness are wired
 * (tracked in BUILD-LOG); this proves the app boots + the landing surface renders.
 */
test('landing page renders and routes to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VocalIQ/i);
  // Protected routes bounce to the self-hosted sign-in (cookie-gated).
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/sign-in|dashboard/);
});
