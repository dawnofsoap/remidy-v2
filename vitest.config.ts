import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages,tooling}/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tooling/rule-tests/fixtures/**'],
    passWithNoTests: false,
    // Tests that start a real database are slower than the default allows.
    testTimeout: 30_000,
  },
});
