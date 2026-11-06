import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone',
      // These share one real database, so they run only once.
      testIgnore: /.stack.spec.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm exec vite',
    url: 'http://localhost:5173/gallery.html',
    // CI starts the full stack first, so the real server is there for auth.stack.spec.ts.
    reuseExistingServer: true,
  },
});
