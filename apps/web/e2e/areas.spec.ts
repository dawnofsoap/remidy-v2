import { expect, test, type Page } from '@playwright/test';
import {
  expectNoViolations,
  mockSignedIn,
  personal,
  saveScreenshot,
  signedIn,
  visibleNav,
} from './support.ts';

// Settings for the person, for their household, and for whoever runs the app, each in its own area.
test.beforeEach(async ({ page }) => {
  await mockSignedIn(page);
});

test('each settings area lists its sections, and a phone opens one at a time', async ({
  page,
}, info) => {
  await page.goto('/settings/security');
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(page.getByRole('heading', { name: 'Security', level: 2 })).toBeVisible();
  if (info.project.name === 'phone') {
    await expect(sections).toBeHidden();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(sections).toBeVisible();
    await expectNoViolations(page);
    await saveScreenshot(page, 'settings-list');
    await sections.getByRole('link', { name: 'Appearance' }).click();
    await expect(page.getByRole('heading', { name: 'Appearance', level: 2 })).toBeVisible();
    // From the area's list, back to More, where the areas are.
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('main').getByRole('link', { name: 'More', exact: true }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(page.getByRole('heading', { name: 'More', level: 1 })).toBeVisible();
  } else {
    await expect(sections.getByRole('link', { name: 'Security' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await sections.getByRole('link', { name: 'Appearance' }).click();
    await expect(page.getByRole('heading', { name: 'Appearance', level: 2 })).toBeVisible();
  }
  await page.goto('/settings/nothing-here');
  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
});

const household = {
  id: 'sp2',
  name: 'The Example household',
  kind: 'shared',
  timeZone: 'America/Denver',
  role: 'member',
};

async function withCategories(page: Page, spaces: object[]) {
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['categories'] } }),
  );
  await page.route('**/api/v1/spaces', (route) => route.fulfill({ json: spaces }));
  await page.route('**/api/v1/spaces/*/categories', (route) =>
    route.fulfill({
      json: [
        {
          id: 'c1',
          name: route.request().url().includes('sp2') ? 'Shared rent' : 'Own rent',
          archived: false,
        },
      ],
    }),
  );
}

test('without a household, time zone and categories are in Settings, and there is no Household', async ({
  page,
}) => {
  await withCategories(page, [personal]);
  await page.goto('/settings/time-zone');
  await expect(page.getByRole('combobox', { name: 'Time zone' })).toHaveValue('America/Chicago');
  await expect(page.getByRole('combobox', { name: 'Time zone' })).toBeEnabled();
  await page.goto('/settings/categories');
  await expect(page.getByRole('button', { name: 'Own rent' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Household' })).toHaveCount(0);
  await page.goto('/household');
  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
});

test('in a household, its categories are in Household for every bill, and a member only sees them', async ({
  page,
}) => {
  await withCategories(page, [personal, household]);
  await page.goto('/settings/categories');
  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();

  await page.goto('/household/categories');
  await expect(page.getByRole('heading', { name: 'Household', level: 1 })).toBeAttached();
  await expect(page.getByText('Shared rent')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add category' })).toHaveCount(0);
  await page.goto('/household/time-zone');
  await expect(page.getByRole('combobox', { name: 'Time zone' })).toHaveValue('America/Denver');
  await expect(page.getByRole('combobox', { name: 'Time zone' })).toBeDisabled();
  await expectNoViolations(page);
  await saveScreenshot(page, 'household');
});

test('going straight to a page works, and back returns', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await visibleNav(page).getByRole('link', { name: 'Home' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('a page with nothing on it centers its message in the content area', async ({ page }) => {
  await page.goto('/');
  const message = await page.getByRole('heading', { name: 'Nothing to show yet' }).boundingBox();
  const main = await page.getByRole('main').boundingBox();
  const middle = (box: { x: number; width: number } | null) =>
    (box?.x ?? 0) + (box?.width ?? 0) / 2;
  expect(Math.abs(middle(message) - middle(main))).toBeLessThan(2);
  // Well below the heading, not tucked under it.
  expect(message?.y ?? 0).toBeGreaterThan(200);
});

test('the settings areas run from the household, to the person, to the whole app', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/get-session', (route) =>
    route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, isInstanceAdmin: true } } }),
  );
  await page.route('**/api/v1/spaces', (route) => route.fulfill({ json: [personal, household] }));
  await page.goto('/more');
  await expect(page.getByRole('list', { name: 'More' }).getByRole('button')).toHaveText([
    'Household',
    'Settings',
    'Administration',
  ]);
});
