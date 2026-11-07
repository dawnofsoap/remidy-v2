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

const dueDate = (page: Page) => page.getByRole('textbox', { name: 'Due date' });
const openCalendar = (page: Page, label: string) =>
  page.getByRole('button', { name: `Choose ${label} from a calendar` }).click();
const calendar = (page: Page, label: string) =>
  page.getByRole('dialog', { name: `Choose ${label}` });
const dayButton = (page: Page, label: string, name: RegExp) =>
  calendar(page, label).getByRole('button', { name });

test.describe('on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 640, 'Only phones use the bottom sheet.');

  const typedDate = (page: Page) => page.getByRole('textbox', { name: 'Or type the date' });

  for (const theme of ['light', 'dark'] as const) {
    test(`comes up from the bottom, with no violations in the ${theme} theme`, async ({ page }) => {
      await page.goto(`/gallery.html?theme=${theme}`);
      await dueDate(page).click();
      const sheet = calendar(page, 'Due date');
      await expect(sheet).toBeVisible();

      const box = await sheet.boundingBox();
      const screen = page.viewportSize();
      if (!box || !screen) throw new Error('Not on the page.');
      expect(box.width).toBe(screen.width);
      expect(box.x).toBe(0);
      expect(box.y + box.height).toBe(screen.height);
      await expectNoViolations(page);
      await saveScreenshot(page, `calendar-sheet-${theme}`, false);
    });
  }

  for (const [name, width, height] of [
    ['tall', 390, 844],
    ['short', 390, 667],
    ['very short', 360, 568],
    ['the window in the report', 500, 625],
  ] as const) {
    test(`fits a ${name} screen in every view, without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/gallery.html');
      await dueDate(page).click();
      const sheet = calendar(page, 'Due date');
      await expect(sheet).toBeVisible();

      const heights: number[] = [];
      const check = async () => {
        const fits = await sheet.evaluate(
          (element) => element.scrollHeight <= element.clientHeight,
        );
        expect(fits).toBe(true);
        await expect(sheet.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 });
        heights.push((await sheet.boundingBox())?.height ?? 0);
      };
      await check();

      const dayCell = await sheet
        .getByRole('button', { name: /, 20\d\d/ })
        .first()
        .boundingBox();
      expect(dayCell?.height).toBeGreaterThanOrEqual(36);
      const grid = await sheet.getByRole('grid').boundingBox();
      const box = await sheet.boundingBox();
      expect(grid?.width).toBeGreaterThan((box?.width ?? 0) - 60);

      await sheet.getByRole('button', { name: /choose a month/ }).click();
      await check();
      await sheet.getByRole('button', { name: /choose a year/ }).click();
      await check();

      // Nothing jumps when switching views.
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    });
  }

  test('opens from the button as well', async ({ page }) => {
    await page.goto('/gallery.html');
    await openCalendar(page, 'Due date');
    await expect(calendar(page, 'Due date')).toBeVisible();
    await expect(typedDate(page)).toBeVisible();
  });

  test('doesn’t bring up the on-screen keyboard until asked', async ({ page }) => {
    await page.goto('/gallery.html');
    await expect(dueDate(page)).toHaveAttribute('inputmode', 'none');
    await dueDate(page).click();
    await expect(calendar(page, 'Due date')).toBeVisible();
    await expect(typedDate(page)).not.toBeFocused();
    await expect(typedDate(page)).not.toHaveAttribute('inputmode', 'none');
  });

  test('picks a day, closes, and shows it', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await dueDate(page).click();
    await dayButton(page, 'Due date', /March 20, 2026/).click();
    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('3/20/2026');
  });

  test('can be typed in, which moves the calendar', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).click();
    await typedDate(page).fill('7/4/31');
    await expect(dayButton(page, 'Due date', /July 4, 2031, selected/)).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('7/4/2031');
  });

  test('says what’s wrong with a typed date', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).click();
    await typedDate(page).fill('2/30/2026');
    await typedDate(page).blur();
    await calendar(page, 'Due date').getByRole('heading').click();
    await expect(typedDate(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(typedDate(page)).toHaveAccessibleDescription(/such as 3\/8\/2026/);
  });

  test('closes when tapping outside, changing nothing', async ({ page }) => {
    await page.goto('/gallery.html');
    await dueDate(page).fill('3/8/2026');
    await dueDate(page).click();
    await expect(calendar(page, 'Due date')).toBeVisible();
    await page.mouse.click(195, 20);
    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('3/8/2026');
  });

  test('works from inside a modal', async ({ page }) => {
    await page.goto('/gallery.html');
    await page.getByRole('button', { name: 'Open modal' }).click();
    const field = page.getByRole('textbox', { name: 'Date paid' });
    await field.fill('3/8/2026');
    await field.click();
    await dayButton(page, 'Date paid', /March 20, 2026/).click();
    await expect(field).toHaveValue('3/20/2026');
  });
});
