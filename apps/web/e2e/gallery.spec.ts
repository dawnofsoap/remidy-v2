import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(
    violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
}

/** Saves a picture for a person to review when SCREENSHOT_DIR is set. */
async function saveScreenshot(page: Page, name: string, fullPage = true) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) {
    await page.screenshot({
      path: join(dir, `${test.info().project.name}-${name}.png`),
      fullPage,
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/gallery.html?theme=${theme}`);
      await expect(page.getByRole('heading', { name: 'UI kit' })).toBeVisible();
    });

    test('the page has no WCAG 2.2 AA violations', async ({ page }) => {
      await expectNoViolations(page);
      await saveScreenshot(page, `gallery-${theme}`);
    });

    test('an open modal has no violations', async ({ page }) => {
      await page.getByRole('button', { name: 'Open modal' }).click();
      await expect(page.getByRole('dialog', { name: 'Mark paid' })).toBeVisible();
      await expectNoViolations(page);
      await saveScreenshot(page, `modal-${theme}`, false);
    });

    test('a toast has no violations', async ({ page }) => {
      await page.getByRole('button', { name: 'Show toast' }).click();
      const toast = page.locator('[data-sonner-toast]');
      await expect(toast).toBeVisible();
      // Measure the settled toast. Contrast is meaningless partway through its fade-in.
      await expect(toast).toHaveCSS('opacity', '1');
      await expectNoViolations(page);
    });
  });
}

test('a toast appears at the top, top-right on larger screens', async ({ page }, testInfo) => {
  await page.goto('/gallery.html');
  await page.getByRole('button', { name: 'Show toast' }).click();
  const toast = page.locator('[data-sonner-toast]');
  await expect(toast).toHaveCSS('opacity', '1');

  const box = await toast.boundingBox();
  const screen = page.viewportSize();
  if (!box || !screen) throw new Error('Not on the page.');
  expect(box.y + box.height).toBeLessThan(screen.height / 4);
  if (testInfo.project.name === 'desktop') {
    expect(box.x).toBeGreaterThan(screen.width / 2);
  } else {
    expect(box.x).toBeLessThanOrEqual(16);
    expect(box.x + box.width).toBeGreaterThanOrEqual(screen.width - 16);
  }
});

test.describe('closing a toast', () => {
  const show = async (page: Page) => {
    await page.goto('/gallery.html');
    await page.getByRole('button', { name: 'Show toast' }).click();
    const toast = page.locator('[data-sonner-toast]');
    await expect(toast).toHaveCSS('opacity', '1');
    return toast;
  };
  const closeButton = (page: Page) => page.getByRole('button', { name: 'Close toast' });

  test('has an X on larger screens, at the end of the toast', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Phones swipe toasts away.');
    const toast = await show(page);
    await expect(closeButton(page)).toBeVisible();

    const box = await toast.boundingBox();
    const button = await closeButton(page).boundingBox();
    if (!box || !button) throw new Error('Not on the page.');
    expect(button.x).toBeGreaterThan(box.x + box.width / 2);
    expect(button.width).toBeGreaterThanOrEqual(24);
    expect(button.height).toBeGreaterThanOrEqual(24);
    await expectNoViolations(page);
    await saveScreenshot(page, 'toast', false);

    await closeButton(page).click();
    await expect(toast).toHaveCount(0);
  });

  test('closes by keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Phones swipe toasts away.');
    const toast = await show(page);
    await closeButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(toast).toHaveCount(0);
  });

  test('has no X on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Only phones hide it.');
    await show(page);
    await expect(closeButton(page)).toBeHidden();
  });
});

test('the theme setting overrides the system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/gallery.html?theme=light');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/gallery.html?theme=dark');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).toBe('rgb(246, 246, 247)');
  expect(dark).toBe('rgb(15, 15, 17)');
});

test('the system preference applies when no theme is set', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/gallery.html');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(15, 15, 17)');
});

test('the modal traps keyboard focus and returns it on close', async ({ page }) => {
  await page.goto('/gallery.html');
  const opener = page.getByRole('button', { name: 'Open modal' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Mark paid' });
  await expect(dialog).toBeVisible();

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('controls are large enough to tap', async ({ page }) => {
  await page.goto('/gallery.html');
  const controls = page.locator('button, input, select');
  const count = await controls.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i += 1) {
    const box = await controls.nth(i).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('the page never scrolls sideways', async ({ page }) => {
  await page.goto('/gallery.html');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
