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
    await expect(
      calendar(page, 'Due date').getByRole('button', { name: 'March, choose a month' }),
    ).toBeVisible();
    await dayButton(page, 'Due date', /March 20, 2026/).click();

    await expect(calendar(page, 'Due date')).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('3/20/2026');
    await expect(
      page.getByRole('button', { name: 'Choose Due date from a calendar' }),
    ).toBeFocused();
  });

  test('works by keyboard, starting on the selected day', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Phones use the bottom sheet.');
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

  test.describe('clicking in the text', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Phones use the bottom sheet.');

    test('stays a popup rather than a sheet', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      const box = await calendar(page, 'Due date').boundingBox();
      if (!box) throw new Error('Not on the page.');
      expect(box.width).toBeLessThan(400);
    });

    test('opens the calendar and leaves the cursor there for typing', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await expect(calendar(page, 'Due date')).toBeVisible();
      await expect(dueDate(page)).toBeFocused();

      await page.keyboard.type('3/8/2031');
      await expect(dueDate(page)).toHaveValue('3/8/2031');
      await expect(dueDate(page)).toBeFocused();
      await expect(calendar(page, 'Due date')).toBeVisible();
      await expectNoViolations(page);
    });

    test('moves the calendar to the month being typed', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await page.keyboard.type('7/4/2031');
      await expect(
        calendar(page, 'Due date').getByRole('button', { name: 'July, choose a month' }),
      ).toBeVisible();
      await expect(
        calendar(page, 'Due date').getByRole('button', { name: '2031, choose a year' }),
      ).toBeVisible();
      await expect(dayButton(page, 'Due date', /July 4, 2031, selected/)).toBeVisible();
    });

    test('stays open when clicking in the text again', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await dueDate(page).click();
      await expect(calendar(page, 'Due date')).toBeVisible();
      await expect(dueDate(page)).toBeFocused();
    });

    test('picks a day, closes, and returns to the text', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).fill('3/8/2026');
      await dueDate(page).click();
      await dayButton(page, 'Due date', /March 20, 2026/).click();
      await expect(dueDate(page)).toHaveValue('3/20/2026');
      await expect(calendar(page, 'Due date')).toHaveCount(0);
      await expect(dueDate(page)).toBeFocused();
    });

    test('closes on Escape and keeps the cursor in the text', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await page.keyboard.press('Escape');
      await expect(calendar(page, 'Due date')).toHaveCount(0);
      await expect(dueDate(page)).toBeFocused();
      await page.keyboard.type('3/8/26');
      await expect(dueDate(page)).toHaveValue('3/8/26');
      await expect(calendar(page, 'Due date')).toHaveCount(0);
    });

    test('closes when clicking elsewhere, without pulling focus back', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await page.keyboard.type('3/8/26');
      await page.getByRole('textbox', { name: 'Bill name' }).click();
      await expect(calendar(page, 'Due date')).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Bill name' })).toBeFocused();
      await expect(dueDate(page)).toHaveValue('3/8/2026');
    });

    test('closes when tabbing away', async ({ page }) => {
      await page.goto('/gallery.html');
      await dueDate(page).click();
      await page.keyboard.press('Tab');
      await expect(calendar(page, 'Due date')).toHaveCount(0);
      await expect(dueDate(page)).not.toBeFocused();
    });

    test('doesn’t open just from tabbing through the form', async ({ page }) => {
      await page.goto('/gallery.html');
      await page.getByRole('textbox', { name: 'Due date' }).focus();
      await expect(dueDate(page)).toBeFocused();
      await expect(calendar(page, 'Due date')).toHaveCount(0);
    });

    test('works inside a modal', async ({ page }) => {
      await page.goto('/gallery.html');
      await page.getByRole('button', { name: 'Open modal' }).click();
      const field = page.getByRole('textbox', { name: 'Date paid' });
      await field.click();
      await page.keyboard.type('3/8/2031');
      await expect(calendar(page, 'Date paid')).toBeVisible();
      await expect(field).toHaveValue('3/8/2031');
      await expect(field).toBeFocused();
    });
  });

  test('keeps the button’s highlight inside the field', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Phones use the bottom sheet.');
    await page.goto('/gallery.html');
    const button = page.getByRole('button', { name: 'Choose Due date from a calendar' });
    await button.hover();
    await button.click();
    await expect(calendar(page, 'Due date')).toBeVisible();
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    const highlight = button.locator('span');
    await expect(highlight).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const box = await highlight.boundingBox();
    const field = await dueDate(page).boundingBox();
    if (!box || !field) throw new Error('Not on the page.');
    expect(box.x + box.width).toBeLessThan(field.x + field.width - 2);
    expect(box.y).toBeGreaterThan(field.y + 2);
    expect(box.y + box.height).toBeLessThan(field.y + field.height - 2);
    await saveScreenshot(page, 'calendar-open', false);
  });

  test.describe('choosing a month or year', () => {
    const open = async (page: Page, label: string, value: string) => {
      await page.goto('/gallery.html');
      await page.getByRole('textbox', { name: label }).fill(value);
      await openCalendar(page, label);
    };
    const monthButton = (page: Page, label: string, name: string) =>
      calendar(page, label).getByRole('button', { name: `${name}, choose a month` });
    const yearButton = (page: Page, label: string, name: string) =>
      calendar(page, label).getByRole('button', { name: `${name}, choose a year` });
    const choice = (page: Page, label: string, name: string) =>
      calendar(page, label).getByRole('button', { name, exact: true });

    for (const theme of ['light', 'dark'] as const) {
      test(`shows both lists with no violations in the ${theme} theme`, async ({ page }) => {
        await page.goto(`/gallery.html?theme=${theme}`);
        await dueDate(page).fill('3/8/2026');
        await openCalendar(page, 'Due date');
        await monthButton(page, 'Due date', 'March').click();
        await expect(
          calendar(page, 'Due date').getByRole('group', { name: 'Months' }),
        ).toBeVisible();
        await expectNoViolations(page);
        await saveScreenshot(page, `calendar-months-${theme}`, false);

        await yearButton(page, 'Due date', '2026').click();
        await expect(
          calendar(page, 'Due date').getByRole('group', { name: 'Years' }),
        ).toBeVisible();
        await expectNoViolations(page);
        await saveScreenshot(page, `calendar-years-${theme}`, false);
      });
    }

    test('lists all twelve months, and goes to the one chosen', async ({ page }) => {
      await open(page, 'Due date', '3/8/2026');
      await monthButton(page, 'Due date', 'March').click();
      const months = calendar(page, 'Due date').getByRole('group', { name: 'Months' });
      await expect(months.getByRole('button')).toHaveText([
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]);
      await expect(choice(page, 'Due date', 'Mar')).toHaveAttribute('aria-current', 'true');
      await expect(choice(page, 'Due date', 'Mar')).toBeFocused();

      await choice(page, 'Due date', 'Oct').click();
      await expect(monthButton(page, 'Due date', 'October')).toBeVisible();
      await expect(yearButton(page, 'Due date', '2026')).toBeVisible();
      await dayButton(page, 'Due date', /October 15, 2026/).click();
      await expect(dueDate(page)).toHaveValue('10/15/2026');
    });

    test('shows a page of years with no scrollbar, and the arrows reach them all', async ({
      page,
    }) => {
      await open(page, 'Due date', '3/8/2026');
      await yearButton(page, 'Due date', '2026').click();
      const dialog = calendar(page, 'Due date');
      const years = dialog.getByRole('group', { name: 'Years' });
      const earlier = dialog.getByRole('button', { name: 'Earlier years' });
      const later = dialog.getByRole('button', { name: 'Later years' });
      await expect(years.getByRole('button')).toHaveCount(12);
      await expect(choice(page, 'Due date', '2026')).toBeFocused();
      await expect(years).toHaveJSProperty(
        'scrollHeight',
        await years.evaluate((element) => element.clientHeight),
      );

      await later.click();
      await expect(choice(page, 'Due date', '2035')).toBeVisible();
      await expect(choice(page, 'Due date', '2026')).toHaveCount(0);
      await earlier.click();
      await expect(choice(page, 'Due date', '2026')).toBeVisible();

      // Every year is reachable, from one end of the range to the other.
      while (await earlier.isEnabled()) await earlier.click();
      await expect(years.getByRole('button').first()).toHaveText('1900');
      while (await later.isEnabled()) await later.click();
      await expect(years.getByRole('button').last()).toHaveText('2099');
      await expect(later).toBeDisabled();

      await choice(page, 'Due date', '2099').click();
      await expect(yearButton(page, 'Due date', '2099')).toBeVisible();
      await expect(monthButton(page, 'Due date', 'March')).toBeVisible();
      await dayButton(page, 'Due date', /March 8, 2099/).click();
      await expect(dueDate(page)).toHaveValue('3/8/2099');
    });

    test('opens on the page holding the year shown', async ({ page }) => {
      await open(page, 'Due date', '3/8/1955');
      await yearButton(page, 'Due date', '1955').click();
      await expect(choice(page, 'Due date', '1955')).toBeFocused();
      await expect(choice(page, 'Due date', '1955')).toHaveAttribute('aria-current', 'true');
    });

    test('can still be reached by keyboard on a page without the year shown', async ({ page }) => {
      await open(page, 'Due date', '3/8/2026');
      await yearButton(page, 'Due date', '2026').click();
      await calendar(page, 'Due date').getByRole('button', { name: 'Later years' }).click();
      await page.keyboard.press('Tab');
      await expect(
        calendar(page, 'Due date')
          .getByRole('group', { name: 'Years' })
          .getByRole('button')
          .first(),
      ).toBeFocused();
    });

    test('clicking the same name again goes back to the days, changing nothing', async ({
      page,
    }) => {
      await open(page, 'Due date', '3/8/2026');
      await monthButton(page, 'Due date', 'March').click();
      await monthButton(page, 'Due date', 'March').click();
      await expect(dayButton(page, 'Due date', /March 8, 2026, selected/)).toBeFocused();
    });

    test('works by keyboard', async ({ page }) => {
      await open(page, 'Due date', '3/8/2026');
      await monthButton(page, 'Due date', 'March').focus();
      await page.keyboard.press('Enter');
      await expect(choice(page, 'Due date', 'Mar')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(choice(page, 'Due date', 'Jun')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(choice(page, 'Due date', 'Jul')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(monthButton(page, 'Due date', 'July')).toBeVisible();
    });

    test('can’t choose a month or year outside the limits', async ({ page }) => {
      await open(page, 'Paid on', '6/1/2026');
      await monthButton(page, 'Paid on', 'June').click();
      await expect(choice(page, 'Paid on', 'Feb')).toBeDisabled();
      await expect(choice(page, 'Paid on', 'Mar')).toBeEnabled();
      await expect(choice(page, 'Paid on', 'Dec')).toBeEnabled();

      await yearButton(page, 'Paid on', '2026').click();
      const years = calendar(page, 'Paid on').getByRole('group', { name: 'Years' });
      await expect(years.getByRole('button')).toHaveText(['2026', '2027']);
      await choice(page, 'Paid on', '2027').click();

      await monthButton(page, 'Paid on', 'June').click();
      await expect(choice(page, 'Paid on', 'Jun')).toBeEnabled();
      await expect(choice(page, 'Paid on', 'Jul')).toBeDisabled();
    });

    test('keeps a chosen month within the limits when the year changes', async ({ page }) => {
      await open(page, 'Paid on', '12/10/2026');
      await yearButton(page, 'Paid on', '2026').click();
      await choice(page, 'Paid on', '2027').click();
      // December 2027 is past the limit, so it stops at the last month allowed.
      await expect(monthButton(page, 'Paid on', 'June')).toBeVisible();
      await expect(yearButton(page, 'Paid on', '2027')).toBeVisible();
    });

    test('shows the limit partway through a month', async ({ page }) => {
      await open(page, 'Paid on', '3/20/2026');
      await expect(
        calendar(page, 'Paid on').getByRole('button', { name: 'Previous month' }),
      ).toBeDisabled();
      await expect(dayButton(page, 'Paid on', /March 14, 2026/)).toBeDisabled();
      await expect(dayButton(page, 'Paid on', /March 15, 2026/)).toBeEnabled();
    });

    test('still returns to the text after opening from it', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'phone', 'Phones use the bottom sheet.');
      await page.goto('/gallery.html');
      await dueDate(page).fill('3/8/2026');
      await dueDate(page).click();
      await monthButton(page, 'Due date', 'March').click();
      await choice(page, 'Due date', 'Oct').click();
      // Focus was in the list, so it needs somewhere to go now the list has closed.
      await expect(dayButton(page, 'Due date', /October 1, 2026/)).toBeFocused();
      await dayButton(page, 'Due date', /October 15, 2026/).click();
      await expect(dueDate(page)).toHaveValue('10/15/2026');
      await expect(dueDate(page)).toBeFocused();
    });
  });

  test('can’t pick outside the limits', async ({ page }) => {
    await page.goto('/gallery.html');
    await paidOn(page).fill('6/10/2027');
    await openCalendar(page, 'Paid on');
    await expect(dayButton(page, 'Paid on', /June 15, 2027/)).toBeEnabled();
    await expect(dayButton(page, 'Paid on', /June 16, 2027/)).toBeDisabled();
    await expect(
      calendar(page, 'Paid on').getByRole('button', { name: /next month/i }),
    ).toBeDisabled();
  });

  test.describe('fitting in the window', () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Phones use the bottom sheet.');

    const staysOnScreen = async (page: Page, label: string) => {
      const popup = calendar(page, label);
      await expect(popup).toBeVisible();
      const screen = page.viewportSize();
      if (!screen) throw new Error('No window.');
      await expect
        .poll(async () => {
          const box = await popup.boundingBox();
          return box && box.y >= 0 && box.y + box.height <= screen.height;
        })
        .toBe(true);

      // It has settled there, rather than jumping between positions.
      const first = await popup.boundingBox();
      await page.waitForTimeout(300);
      expect(await popup.boundingBox()).toEqual(first);
    };

    for (const [name, width, height] of [
      ['the window in the report', 650, 672],
      ['a short window', 900, 560],
      ['a very short window', 900, 420],
    ] as const) {
      test(`stays on screen in ${name}, in every view, from a modal`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/gallery.html');
        await page.getByRole('button', { name: 'Open modal' }).click();
        await page.getByRole('textbox', { name: 'Date paid' }).click();
        await staysOnScreen(page, 'Date paid');

        const popup = calendar(page, 'Date paid');
        await popup.getByRole('button', { name: /choose a month/ }).click();
        await staysOnScreen(page, 'Date paid');
        await popup.getByRole('button', { name: /choose a year/ }).click();
        await staysOnScreen(page, 'Date paid');
      });
    }

    test('keeps its full size when there is room', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1200 });
      await page.goto('/gallery.html');
      await page.getByRole('button', { name: 'Open modal' }).click();
      await page.getByRole('textbox', { name: 'Date paid' }).click();
      const day = await dayButton(page, 'Date paid', /, 20\d\d/)
        .first()
        .boundingBox();
      expect(day?.height).toBe(44);
    });

    test('shrinks its rows to fit, without going below a usable size', async ({ page }) => {
      await page.setViewportSize({ width: 650, height: 672 });
      await page.goto('/gallery.html');
      await page.getByRole('button', { name: 'Open modal' }).click();
      await page.getByRole('textbox', { name: 'Date paid' }).click();
      await staysOnScreen(page, 'Date paid');
      const day = await dayButton(page, 'Date paid', /, 20\d\d/)
        .first()
        .boundingBox();
      expect(day?.height).toBeGreaterThanOrEqual(32);
      const fits = await calendar(page, 'Date paid').evaluate(
        (element) => element.scrollHeight <= element.clientHeight,
      );
      expect(fits).toBe(true);
    });
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
    await paidOn(page).fill('7/1/2027');
    await tapElsewhere(page);
    await expect(paidOn(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(paidOn(page)).toHaveAccessibleDescription(/2027 or earlier/);
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
