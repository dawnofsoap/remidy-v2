import { defineConfig, devices } from '@playwright/test';

// Tests the production image behind a TLS proxy. Start it first, on a new database:
//   docker compose -p remidy-prodcheck -f deploy/compose.yaml -f deploy/check/compose.yaml \
//     --env-file deploy/check/check.env up --detach --build --wait
export default defineConfig({
  testDir: './e2e-production',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // The tests share one stack, and restore.spec.ts replaces its database.
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://localhost:8443',
    // The test proxy signs its own certificate.
    ignoreHTTPSErrors: true,
    // Shows every request and the page at each step, for failures that don't happen locally.
    trace: 'retain-on-failure',
  },
});
