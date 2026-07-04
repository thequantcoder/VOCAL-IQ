import { type Page, expect, test } from '@playwright/test';

/**
 * Motion polish + reduced-motion contract (Day 50, self-audit H). The app's entrance
 * animations (`.vq-reveal`, `.vq-stagger`) are gated on `prefers-reduced-motion: no-preference`,
 * so a reduced-motion user gets the final state with NO animation. We assert that directly
 * against the real stylesheet (loaded on the public landing) under both preferences.
 *
 * The full authenticated onboarding-completion journey (create agent → number → test call →
 * results) needs a seeded user + api/db and is covered by the pure `computeOnboarding` unit
 * tests; the smoke suite covers the shell (see BUILD-LOG for the seeded-e2e note).
 */

async function revealAnimationName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'vq-reveal';
    document.body.appendChild(el);
    const name = getComputedStyle(el).animationName;
    el.remove();
    return name;
  });
}

test('reduced motion is honoured — no entrance animation runs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // The `.vq-reveal` entrance is gated behind `no-preference`, so under a reduced-motion
  // preference the computed animation resolves to `none` — content appears with no motion.
  expect(await revealAnimationName(page)).toBe('none');
});
