import { expect, test } from '@playwright/test';
import { bill, chooseDay, entry, iso, withBills, withBillsMidMonth } from './bills-mocks.ts';
import { expectNoViolations, saveScreenshot } from './support.ts';

// The Calendar with the server mocked. The real stack is covered in auth.stack.spec.ts.

test('the calendar shows the month as a grid, or a small grid and a chosen day on a phone', async ({
  page,
}, info) => {
  await withBills(page);
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 0 } }),
  );
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  if (info.project.name === 'phone') await chooseDay(page, iso(2));
  const water = page
    .getByRole('main')
    .getByRole('button', { name: /Water/ })
    .filter({ visible: true });
  await expect(water).toBeVisible();
  if (info.project.name !== 'phone') {
    // Every day of the grid is listed, each with its full date for screen readers.
    const days = page.getByRole('list', { name: /\d{4}$/ }).getByRole('listitem');
    expect(await days.count()).toBeGreaterThanOrEqual(28);
  }
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar');

  // Opening a bill shows it with that due date, and Pay offers to pay what's left.
  await water.click();
  const preview = page.getByRole('dialog', { name: 'Water', exact: true });
  await expect(preview.getByRole('region', { name: 'This due date' })).toContainText('$45.00');
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-bill');
  await preview.getByRole('button', { name: 'Pay' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pay Water' });
  await expect(dialog.getByLabel('Amount paid')).toHaveValue('45.00');
  await expect(dialog.getByRole('button', { name: 'Skip this one' })).toBeVisible();
  await expectNoViolations(page);
});

test('the calendar shows the month’s totals, and they follow the month shown', async ({ page }) => {
  await withBills(page);
  // Yesterday is only in this month after the 1st, so it's overdue only then.
  const lateInMonth = iso(-1).slice(0, 7) === iso(0).slice(0, 7);
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: lateInMonth ? [{ ...entry('o1', 'Rent', iso(-1), 10_000), paidCents: 2_500 }] : [],
        upcoming: [entry('u1', 'Water', iso(0), 4_500), entry('u2', 'Phone', iso(0), null)],
      },
    }),
  );
  const asked: string[] = [];
  await page.route('**/api/v1/totals?**', (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('from') ?? '');
    return route.fulfill({ json: { dueCents: 150_000, unknownCount: 1, paidCents: 5_000 } });
  });
  await page.goto('/calendar');
  const totals = page.getByRole('region', { name: /^\w+ \d{4} totals$/ });
  await expect(totals).toContainText('Due$1,500.00 + 1 that varies');
  await expect(totals).toContainText('Paid$50.00');
  // What's left: Water, the rest of Rent when it's in this month, and Phone, which varies.
  await expect(totals).toContainText(
    `Left to pay${lateInMonth ? '$120.00' : '$45.00'} + 1 that varies`,
  );
  await expect(totals).toContainText(lateInMonth ? 'Overdue$75.00' : 'OverdueNone');
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-totals');

  // Next month asks for its own totals, and nothing in it is overdue yet.
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(totals).toContainText('OverdueNone');
  expect(new Set(asked).size).toBe(2);
});

test('the calendar shows logos only, with names when asked, and remembers', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'Phones list bills by name.');
  await withBills(page);
  await page.goto('/calendar');
  const grid = page.getByRole('list', { name: /\d{4}$/ });
  const water = grid.getByRole('button', { name: /\bWater, / });
  // The name is in the label and the hint, not on the screen.
  await expect(water).toBeVisible();
  await expect(water).not.toContainText('Water');
  await expect(water).toHaveAttribute('title', /^Water: /);
  const names = page.getByRole('button', { name: 'Show names' });
  await expect(names).toHaveAttribute('aria-pressed', 'false');
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-logos');

  await names.click();
  await expect(names).toHaveAttribute('aria-pressed', 'true');
  await expect(water).toContainText('Water');
  await saveScreenshot(page, 'calendar-names');
  await page.reload();
  await expect(grid.getByRole('button', { name: /\bWater, / })).toContainText('Water');
  await expect(page.getByRole('button', { name: 'Show names' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('on a phone, the month is a small grid, and choosing a day lists its bills', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Wider screens show the full grid.');
  // Pinned mid-month, so every bill is in the month shown even at the end of a month.
  const day = await withBillsMidMonth(page);
  await page.goto('/calendar');
  const grid = page.getByRole('list', { name: /\d{4}$/ });
  // Today is chosen first, and marked as today.
  const today = grid.getByRole('button', { pressed: true });
  await expect(today).toHaveAttribute('aria-current', 'date');
  // Days with bills say how many and how urgent.
  await expect(grid.getByRole('button', { name: /, 1 due, overdue$/ })).toHaveCount(1);
  await expect(grid.getByRole('button', { name: /, 1 due, due soon$/ })).toHaveCount(2);

  await chooseDay(page, day(12));
  const chosen = page.getByRole('list', { name: /^\w+day, / });
  await expect(chosen.getByRole('button', { name: /Water/ })).toBeVisible();
  await expect(chosen.getByRole('button')).toHaveCount(1);
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-phone-day');

  // A swipe across the grid moves to the next month.
  const month = page.getByRole('heading', { level: 2 });
  const before = await month.textContent();
  const box = await grid.boundingBox();
  const y = (box?.y ?? 0) + 40;
  const swipe = (type: string, x: number) =>
    grid.dispatchEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true });
  await swipe('pointerdown', 300);
  await swipe('pointerup', 100);
  await expect(month).not.toHaveText(before ?? '');
  await expect(page.getByRole('button', { name: 'This month' })).toBeVisible();
});

test('clicking anywhere in a day opens its list, and a bill in it opens the bill', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'Phones open a day by tapping it already.');
  await withBills(page);
  await page.goto('/calendar');
  const grid = page.getByRole('list', { name: /\d{4}$/ });
  const corner = async (day: ReturnType<typeof grid.getByRole>) => {
    // The bottom right of the day, away from its date and its bills.
    const box = await day.boundingBox();
    await day.click({ position: { x: (box?.width ?? 0) - 6, y: (box?.height ?? 0) - 6 } });
  };

  const waterDay = grid
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /\bWater, / }) });
  await corner(waterDay);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem')).toContainText('Water');
  // Nothing in the grid shows through the open list. The page behind a dialog is hidden from
  // screen readers, so the bill is found by its label.
  const chip = page.locator('ol button[aria-label^="Water, "]');
  const box = await chip.boundingBox();
  const onTop = await page.evaluate(
    ({ x, y }) => {
      // The dialog stops clicks reaching the page, which also hides it from this check, so
      // that's lifted for a moment to see what's painted on top.
      document.body.style.pointerEvents = 'auto';
      const found = document.elementFromPoint(x, y)?.closest('ol')?.getAttribute('aria-label');
      document.body.style.pointerEvents = 'none';
      return found ?? '';
    },
    { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
  );
  expect(onTop).toBe('');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // A day with nothing due opens too, and says so.
  const empty = grid
    .getByRole('listitem')
    .filter({ hasNot: page.getByRole('button', { name: / due$/ }) })
    .first();
  await corner(empty);
  await expect(page.getByRole('dialog')).toContainText('Nothing is due this day.');
  await page.keyboard.press('Escape');

  // A bill in the day still opens the bill, not the day.
  await waterDay.getByRole('button', { name: /\bWater, / }).click();
  await expect(page.getByRole('dialog', { name: 'Water', exact: true })).toBeVisible();
});

test('a bill opened from a day’s list shows straight away, even before it loads', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'Phones list every bill already.');
  await withBills(page);
  // The bills arrive only when the test says, so the moment before can be checked.
  const { promise: arrived, resolve: release } = Promise.withResolvers<boolean>();
  await page.route('**/api/v1/bills', async (route) => {
    await arrived;
    await route.fulfill({ json: [bill('b3', 'Water', 4_500)] });
  });
  await page.goto('/calendar');
  const day = page
    .getByRole('list', { name: /\d{4}$/ })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /\bWater, / }) });
  await day.getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Water/ }).click();

  // The backdrop never drops: the bill's dialog is open, loading, while the bill is on its way.
  const preview = page.getByRole('dialog', { name: 'Water', exact: true });
  await expect(preview.getByRole('status')).toBeVisible();
  await expectNoViolations(page);
  release(true);
  await expect(preview.getByRole('region', { name: 'This due date' })).toContainText('$45.00');
});

test('a day’s list shows all its bills, most urgent first', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Phones list every bill already.');
  await withBills(page);
  // Today, which is always in the month shown.
  const day = iso(0);
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [],
        upcoming: [
          { ...entry('a', 'Gas', day, 3_000), state: 'settled', paidCents: 3_000 },
          entry('b', 'Water', day, 4_500),
          entry('c', 'Internet', day, 6_000),
          entry('d', 'Phone', day, 5_500),
        ],
      },
    }),
  );
  await page.goto('/calendar');
  // How many fit depends on the window's height, so the day is opened by its date.
  await page.getByRole('button', { name: /, 4 due$/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('listitem')).toHaveCount(4);
  await expect(sheet.getByRole('listitem').first()).toContainText('Internet');
  await expect(sheet.getByRole('listitem').last()).toContainText('Paid');
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-day');

  // A bill from the day opens its preview, which pays it. Closing each goes back a step.
  await sheet.getByRole('button', { name: /Water/ }).click();
  await page.getByRole('dialog', { name: 'Water' }).getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByRole('dialog', { name: 'Pay Water' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Water' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(4);
});

test('Home’s small calendar opens a day on the Calendar page', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'It’s only beside the list, on wide screens.');
  await withBills(page);
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 0 } }),
  );
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({ json: { overdue: [], upcoming: [entry('w', 'Water', iso(0), 4_500)] } }),
  );
  await page.goto('/');
  const month = page.getByRole('region', { name: /\d{4}$/ });
  // Today is always in this month, whatever the date.
  const waterDay = month.getByRole('link', { name: /today, 1 due, due soon/ });
  await expect(waterDay).toBeVisible();
  await expectNoViolations(page);
  await saveScreenshot(page, 'home-calendar');

  await waterDay.click();
  await expect(page).toHaveURL(/\/calendar\?day=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('dialog').getByRole('listitem')).toContainText('Water');
});
