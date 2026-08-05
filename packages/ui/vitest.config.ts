import { defineConfig } from 'vitest/config';

/**
 * Only the pure, framework-free modules are unit-tested here (chart geometry maths); the React
 * components are covered by the web app's typecheck/build + e2e. `node` env keeps it dependency-light
 * (no jsdom). Add `*.test.ts` files next to the pure module they cover.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
