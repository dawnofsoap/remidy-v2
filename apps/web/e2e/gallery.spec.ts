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

test.describe('date field, in a real browser', () => {
  const dueDate = (page: Page) => page.getByLabel('Due date');
  const paidOn = (page: Page) => page.getByLabel('Paid on');
  const tapElsewhere = (page: Page) => page.getByRole('heading', { name: 'UI kit' }).click();

  test('asks for the rest of a partly typed date', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Touch screens use a picker, not typed parts.');
    await page.goto('/gallery.html');
    await dueDate(page).click();
    await page.keyboard.type('03');
    await tapElsewhere(page);
    await expect(dueDate(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(dueDate(page)).toHaveAccessibleDescription(/Enter the full date/);
  });

  test('takes a date and keeps it exactly, in any time zone', async ({ browser }) => {
    for (const timezoneId of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Chicago']) {
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();
      await page.goto('/gallery.html');
      await dueDate(page).fill('2026-03-08');
      await tapElsewhere(page);
      await expect(dueDate(page)).toHaveValue('2026-03-08');
      await expect(dueDate(page)).not.toHaveAttribute('aria-invalid');
      await context.close();
    }
  });

  test('tells the browser its limits, and refuses a date outside them', async ({ page }) => {
    await page.goto('/gallery.html');
    await expect(paidOn(page)).toHaveAttribute('min', '2026-01-01');
    await expect(paidOn(page)).toHaveAttribute('max', '2026-12-31');
    await paidOn(page).fill('2027-01-01');
    await tapElsewhere(page);
    await expect(paidOn(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(paidOn(page)).toHaveAccessibleDescription(/2026 or earlier/);
    await expectNoViolations(page);
  });
});
