/**
 * Standalone jest harness for the mobile app. apps/mobile is intentionally OUTSIDE
 * the pnpm workspace (`!apps/mobile` in pnpm-workspace.yaml — its RN/Expo toolchain
 * is not installed at the monorepo root), so these tests run on their own from
 * `apps/mobile` (`npm install && npm test`), not via turbo/CI.
 *
 * ts-jest compiles TypeScript to CommonJS in a plain Node env via the inline
 * tsconfig below — decoupled from the app's Expo tsconfig — so pure logic tests
 * (e.g. `lib/headers.test.ts`) need no React-Native / Expo native mocks.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', target: 'ES2020', esModuleInterop: true, strict: true } },
    ],
  },
};
