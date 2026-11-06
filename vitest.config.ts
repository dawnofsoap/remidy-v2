import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages,tooling}/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tooling/rule-tests/fixtures/**'],
    passWithNoTests: false,
    // Tests that start a real database are slower than the default allows.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // Money and date rules are the riskiest logic, so every line and branch must be tested.
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
