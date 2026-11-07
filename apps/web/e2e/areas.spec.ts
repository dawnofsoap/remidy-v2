import { expect, test } from '@playwright/test';
import { expectNoViolations, mockSignedIn, saveScreenshot, visibleNav } from './support.ts';

// Settings for the person, for a space, and for whoever runs the app, each in its own area.
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
    await sections.getByRole('link', { name: 'Appearance' }).click();
    await expect(page.getByRole('heading', { name: 'Appearance', level: 2 })).toBeVisible();
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

test('the space switcher shows the current space, and space settings are for it', async ({
  page,
}) => {
  await page.goto('/spaces/sp1/settings/general');
  const switcher = page.getByRole('button', { name: /^Space: Personal/ }).filter({ visible: true });
  await expect(switcher).toBeVisible();
  await expect(page.getByLabel('Time zone')).toHaveValue('America/Chicago');
  await page
    .getByRole('button', { name: /^Space: Personal/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Spaces' })).toBeVisible();
  await expectNoViolations(page);
  await saveScreenshot(page, 'space-switcher');
  await page.keyboard.press('Escape');

  // A space the person isn't in can't be told apart from one that doesn't exist.
  await page.goto('/spaces/someone-elses/settings/general');
  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
});

test('going straight to a page works, and back returns', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await visibleNav(page).getByRole('link', { name: 'Home' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});
