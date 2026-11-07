import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const healthy = { status: 'ok', database: 'up' };

export async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(
    violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
}

export async function saveScreenshot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: join(dir, `${test.info().project.name}-${name}.png`) });
}

export const signedIn = {
  user: {
    id: 'u1',
    name: 'Alex Example',
    email: 'alex@example.com',
    mustChangePassword: false,
    isInstanceAdmin: false,
  },
  session: { id: 's1' },
};

/** A signed-in person with a personal space, and the server answering as it would. */
export async function mockSignedIn(page: Page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: healthy }));
  await page.route('**/api/v1/features', (route) => route.fulfill({ json: { enabled: [] } }));
  await page.route('**/api/v1/sign-in-options', (route) =>
    route.fulfill({ json: { adminPasswordInConsole: false, passwordReset: true } }),
  );
  await page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: signedIn }));
  await page.route('**/api/v1/spaces', (route) =>
    route.fulfill({
      json: [
        {
          id: 'sp1',
          name: 'Personal',
          kind: 'personal',
          timeZone: 'America/Chicago',
          role: 'owner',
        },
      ],
    }),
  );
  await page.route('**/api/v1/auth/list-sessions', (route) =>
    route.fulfill({ json: [{ id: 's1' }] }),
  );
}

export const visibleNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
