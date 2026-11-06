import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const healthy = { status: 'ok', database: 'up' };

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(
    violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
}

async function saveScreenshot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: join(dir, `${test.info().project.name}-${name}.png`) });
}

const visibleNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: healthy }));
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('remidy.theme', value);
      }, theme);
    });

    for (const [name, path, heading] of [
      ['home', '/', 'Home'],
      ['settings', '/settings', 'Settings'],
      ['not found', '/does-not-exist', 'Page not found'],
    ] as const) {
      test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
        await expect(page).toHaveTitle(`${heading} · Remidy`);
        await expectNoViolations(page);
        await saveScreenshot(page, `shell-${name.replace(' ', '-')}-${theme}`);
      });
    }
  });
}

test('exactly one navigation shows, in the right place for the screen', async ({ page }, info) => {
  await page.goto('/');
  await expect(visibleNav(page)).toHaveCount(1);
  const box = await visibleNav(page).boundingBox();
  if (info.project.name === 'phone') {
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(844);
  } else {
    expect(box?.x).toBe(0);
  }
});

test('navigating updates the page, marks the link, and moves focus to the content', async ({
  page,
}) => {
  await page.goto('/');
  const nav = visibleNav(page);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toBeFocused();

  // The current page reads differently from the others, not only by its background.
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCSS('font-weight', '600');
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveCSS('font-weight', '500');
});

test('going straight to a page works, and back returns', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await visibleNav(page).getByRole('link', { name: 'Home' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('the skip link is first and jumps to the content', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Keyboard behavior');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test.describe('appearance setting', () => {
  const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = 'rgb(246, 246, 247)';
  const DARK = 'rgb(15, 15, 17)';

  test('applies immediately and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await expect(page.getByRole('radio', { name: 'Match system' })).toBeChecked();
    expect(await background(page)).toBe(LIGHT);

    await page.getByText('Dark', { exact: true }).click();
    await expect.poll(() => background(page)).toBe(DARK);

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await background(page)).toBe(DARK);
  });

  test('match system follows the system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.setItem('remidy.theme', 'light');
    });
    await page.goto('/settings');
    expect(await background(page)).toBe(LIGHT);

    await page.getByText('Match system', { exact: true }).click();
    await expect.poll(() => background(page)).toBe(DARK);
  });

  test('can be changed with the keyboard', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Match system' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
  });
});

test.describe('server status', () => {
  test('stays hidden when everything is healthy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('warns when the database is down', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 503, json: { status: 'degraded', database: 'down' } }),
    );
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('database is unavailable');
    await expectNoViolations(page);
  });

  test('warns when the server cannot be reached', async ({ page }) => {
    await page.route('**/api/health', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('can’t reach the server');
  });
});

test('controls and links are large enough to tap', async ({ page }) => {
  await page.goto('/settings');
  const nav = visibleNav(page).getByRole('link');
  expect(await nav.count()).toBeGreaterThan(1);
  for (let i = 0; i < (await nav.count()); i += 1) {
    expect((await nav.nth(i).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const option = page.locator('fieldset label').first();
  expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('no page scrolls sideways', async ({ page }) => {
  for (const path of ['/', '/settings', '/does-not-exist']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});
