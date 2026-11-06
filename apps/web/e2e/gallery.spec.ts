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
  const dueDate = (page: Page) => page.getByRole('textbox', { name: 'Due date' });
  const paidOn = (page: Page) => page.getByRole('textbox', { name: 'Paid on' });
  const openCalendar = (page: Page, label: string) =>
    page.getByRole('button', { name: `Choose ${label} from a calendar` }).click();
  const calendar = (page: Page, label: string) =>
    page.getByRole('dialog', { name: `Choose ${label}` });
  const dayButton = (page: Page, label: string, name: RegExp) =>
    calendar(page, label).getByRole('button', { name });
  const tapElsewhere = (page: Page) => page.getByRole('heading', { name: 'UI kit' }).click();

  for (const theme of ['light', 'dark'] as const) {
    test(`the calendar has no violations in the ${theme} theme`, async ({ page }) => {
      await page.goto(`/gallery.html?theme=${theme}`);
      await dueDate(page).fill('3/8/2026');
      await openCalendar(page, 'Due date');
      await expect(calendar(page, 'Due date')).toBeVisible();
      await expectNoViolations(page);
      await saveScreenshot(page, `calendar-${theme}`, false);
    });
  }

  test('asks again for a date it can’t read', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2');
    await tapElsewhere(page);
    await expect(dueDate(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(dueDate(page)).toHaveAccessibleDescription(/such as 3\/8\/2026/);
  });

  test('picks a date, and returns focus to the button', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await openCalendar(page, 'Due date');
    await expect(calendar(page, 'Due date').getByText('March 2026')).toBeVisible();
    await dayButton(page, 'Due date', /March 20, 2026/).click();

    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('3/20/2026');
    await expect(
      page.getByRole('button', { name: 'Choose Due date from a calendar' }),
    ).toBeFocused();
  });

  test('works by keyboard, starting on the selected day', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await page.getByRole('button', { name: 'Choose Due date from a calendar' }).focus();
    await page.keyboard.press('Enter');
    await expect(dayButton(page, 'Due date', /March 8, 2026/)).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dueDate(page)).toHaveValue('3/16/2026');
  });

  test('closes on Escape, changing nothing', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await page.getByRole('button', { name: 'Choose Due date from a calendar' }).focus();
    await page.keyboard.press('Enter');
    await expect(calendar(page, 'Due date')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('3/8/2026');
    await expect(
      page.getByRole('button', { name: 'Choose Due date from a calendar' }),
    ).toBeFocused();
  });

  test('can’t pick outside the limits', async ({ page }) => {
    await page.goto('/gallery.html');
    await paidOn(page).fill('12/10/2026');
    await openCalendar(page, 'Paid on');
    await expect(dayButton(page, 'Paid on', /December 15, 2026/)).toBeEnabled();
    await expect(dayButton(page, 'Paid on', /December 16, 2026/)).toBeDisabled();
    await expect(
      calendar(page, 'Paid on').getByRole('button', { name: /next month/i }),
    ).toBeDisabled();
  });

  test('names each day with the number it shows, and marks the selected one', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await openCalendar(page, 'Due date');
    await expect(
      calendar(page, 'Due date').getByRole('button', {
        name: 'Sunday, March 8, 2026, selected',
        exact: true,
      }),
    ).toHaveText('8');
  });

  test('refuses a typed date outside the limits', async ({ page }) => {
    await page.goto('/gallery.html');
    await paidOn(page).fill('1/1/2027');
    await tapElsewhere(page);
    await expect(paidOn(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(paidOn(page)).toHaveAccessibleDescription(/2026 or earlier/);
  });

  test('picks the same date in any time zone', async ({ browser, baseURL }) => {
    for (const timezoneId of [
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
      'America/Chicago',
      // Midnight doesn't exist here on the day clocks change.
      'America/Havana',
    ]) {
      const context = await browser.newContext({ timezoneId, baseURL: String(baseURL) });
      const page = await context.newPage();
      await page.goto('/gallery.html');
      await dueDate(page).fill('3/1/2026');
      await openCalendar(page, 'Due date');
      await dayButton(page, 'Due date', /March 8, 2026/).click();
      await expect(dueDate(page), timezoneId).toHaveValue('3/8/2026');
      await context.close();
    }
  });

  test('works inside a modal', async ({ page }) => {
    await page.goto('/gallery.html');
    await page.getByRole('button', { name: 'Open modal' }).click();
    const field = page.getByRole('textbox', { name: 'Date paid' });
    await field.fill('3/8/2026');
    await openCalendar(page, 'Date paid');
    await dayButton(page, 'Date paid', /March 20, 2026/).click();
    await expect(field).toHaveValue('3/20/2026');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await expectNoViolations(page);
  });
});
