import { expect, test } from '@playwright/test';
import { bill, chooseDay, entry, iso, withBills, withBillsMidMonth } from './bills-mocks.ts';
import { expectNoViolations, saveScreenshot } from './support.ts';

// Home and Bills with the server mocked. The real stack is covered in auth.stack.spec.ts.

test('Home shows the month’s figures, then cards, with what’s overdue first on a phone', async ({
  page,
}, info) => {
  await withBills(page);
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 5_000 } }),
  );
  await page.goto('/');
  const figures = page.getByRole('region', { name: 'This month' });
  await expect(figures).toContainText('Overdue');
  await expect(figures).toContainText('$1,450.00');
  await expect(figures).toContainText('$45.00 + 1 that varies');
  await expect(figures).toContainText('$50.00');
  await expect(figures).toContainText(/\d+% paid/);

  const overdue = page.getByRole('region', { name: 'Overdue' });
  await expect(overdue.getByRole('list', { name: 'Overdue' })).toContainText('Rent');
  const late = await overdue.boundingBox();
  const top = await figures.boundingBox();
  if (info.project.name === 'phone') {
    expect(late?.y ?? 0).toBeLessThan(top?.y ?? 0);
  } else {
    expect(top?.y ?? 0).toBeLessThan(late?.y ?? 0);
  }
  await expectNoViolations(page);
  await saveScreenshot(page, 'home-cards');

  // A bill opens its preview, with this due date and Pay, as on the calendar.
  await overdue.getByRole('button', { name: /Rent/ }).click();
  const preview = page.getByRole('dialog', { name: 'Rent', exact: true });
  await expect(preview.getByRole('region', { name: 'This due date' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Pay' })).toBeVisible();
});

test('bills on auto-pay say so on Home, the Calendar and a day’s list', async ({ page }, info) => {
  // Pinned mid-month, so Electric is in the month shown even at the end of a month.
  const day = await withBillsMidMonth(page);
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 0 } }),
  );
  // Home: in words beside the date, and not on a bill that doesn't pay itself.
  await page.goto('/');
  const month = page.getByRole('main');
  await expect(
    month.getByRole('button', { name: /Electric/ }).filter({ visible: true }),
  ).toContainText(/Auto.pay/);
  await expect(
    month.getByRole('button', { name: /Water/ }).filter({ visible: true }),
  ).not.toContainText(/Auto.pay/);

  await page.goto('/calendar');
  if (info.project.name === 'phone') {
    // A phone lists the chosen day's bills by name, each saying so.
    await chooseDay(page, day(15));
    const list = page.getByRole('list', { name: /^\w+day, / });
    await expect(list.getByRole('button', { name: /Electric/ })).toContainText(/Auto.pay/);
    return;
  }
  // The grid: in the bill's label and hint, and marked on its logo.
  const grid = page.getByRole('list', { name: /\d{4}$/ });
  const electric = grid.getByRole('button', { name: /\bElectric, / });
  await expect(electric).toHaveAccessibleName(/auto-pay/);
  await expect(electric).toHaveAttribute('title', /auto-pay/);
  await expect(grid.getByRole('button', { name: /\bWater, / })).not.toHaveAccessibleName(
    /auto-pay/,
  );
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-autopay');

  // A day's list says it in words.
  await grid
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /\bElectric, / }) })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Electric/ })).toContainText(
    /Auto.pay/,
  );
});

test('Home is about this month: later bills are left to the Calendar', async ({ page }) => {
  await withBills(page);
  // Forty days on is always after this month, and outside the next 7 days.
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [entry('o1', 'Rent', iso(-3), 145_000)],
        upcoming: [entry('u9', 'Insurance', iso(40), 61_240)],
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Overdue' })).toContainText('Rent');
  await expect(page.getByRole('main')).not.toContainText('Insurance');
});

test('the month’s card lists what’s left to pay first, then what’s paid, in the paid color', async ({
  page,
}) => {
  await withBills(page);
  // Both due today, so only whether it's paid decides the order, not the date or the name.
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [],
        upcoming: [
          { ...entry('s1', 'Gym', iso(0), 4_000), state: 'settled', paidCents: 4_000 },
          entry('u1', 'Water', iso(0), 4_500),
        ],
      },
    }),
  );
  await page.goto('/');
  const card = page.getByRole('region', { name: / bills$/ });
  await expect(card).toContainText('1 to pay · 1 paid');
  const rows = card.getByRole('listitem');
  await expect(rows.nth(0)).toContainText('Water');
  await expect(rows.nth(1)).toContainText('Gym');
  await expect(rows.nth(1).getByText('Paid $40.00')).toHaveClass(/text-paid/);
  await expectNoViolations(page);
  await saveScreenshot(page, 'home-paid');
});

test('a long card shows its first few, and the rest when asked', async ({ page }) => {
  await withBills(page);
  const late = ['Rent', 'Water', 'Electric', 'Gym', 'Phone', 'Internet'];
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: late.map((name, index) =>
          entry(`o${String(index)}`, name, iso(-1 - index), 1_000),
        ),
        upcoming: [],
      },
    }),
  );
  await page.goto('/');
  const list = page.getByRole('list', { name: 'Overdue' });
  await expect(list.getByRole('listitem')).toHaveCount(4);
  const more = page.getByRole('button', { name: 'Show 2 more' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await page.getByRole('button', { name: 'Show less' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(4);
});

test('Bills can be searched, archived ones included, and says when nothing matches', async ({
  page,
}, info) => {
  await withBills(page);
  await page.route('**/api/v1/bills', (route) =>
    route.fulfill({
      json: [
        bill('b1', 'Rent', 145_000),
        { ...bill('b2', 'Electric', null), merchant: 'City Power' },
        bill('b3', 'Water', 4_500),
        { ...bill('b4', 'Old electric', 3_000), archived: true },
      ],
    }),
  );
  await page.goto('/bills');
  const phone = info.project.name === 'phone';
  const shown = (label: string) =>
    phone
      ? page.getByRole('list', { name: label, exact: true }).getByRole('listitem')
      : page
          .getByRole('table', { name: label, exact: true })
          .getByRole('row')
          .filter({
            hasNot: page.getByRole('columnheader'),
          });
  await expect(shown('Bills')).toHaveCount(3);
  await expect(page.getByRole('table', { name: 'Archived bills' })).toHaveCount(0);

  // By merchant as well as name, and archived bills show without asking.
  const search = page.getByRole('searchbox', { name: 'Search bills' });
  await search.fill('power');
  await expect(shown('Bills')).toHaveCount(1);
  await expect(shown('Bills')).toContainText('Electric');
  await search.fill('electric');
  await expect(shown('Bills')).toHaveCount(1);
  await expect(shown('Archived bills')).toHaveCount(1);
  await expect(shown('Archived bills')).toContainText('Old electric');
  await expect(page.getByRole('heading', { name: 'Archived', exact: true })).toBeVisible();
  await expectNoViolations(page);
  await saveScreenshot(page, 'bills-search');

  await search.fill('internet');
  await expect(page.getByRole('main')).toContainText('No bills match “internet”.');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(shown('Bills')).toHaveCount(3);
});

test('Bills is a table on wider screens and a list on a phone', async ({ page }, info) => {
  await withBills(page);
  await page.goto('/bills');
  if (info.project.name === 'phone') {
    await expect(page.getByRole('list', { name: 'Bills' })).toBeVisible();
    await expect(page.getByRole('table')).toBeHidden();
  } else {
    const table = page.getByRole('table', { name: 'Bills' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Name',
      'Schedule',
      'Next due',
      'Auto-pay',
      'Amount',
    ]);
    await expect(table.getByRole('row', { name: /Electric/ })).toContainText('Varies');
    // Opening a bill shows it, and editing is a choice.
    await table.getByRole('button', { name: /^Rent/ }).click();
    await expect(page.getByRole('dialog', { name: 'Rent', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  const add = page.getByRole('button', { name: 'Add bill' });
  await expect(add).toBeVisible();
  if (info.project.name === 'phone') {
    // A round button floating above the tab bar, rather than the page's title row.
    await expect(page.getByRole('heading', { name: 'Bills', level: 1 })).not.toBeInViewport({
      ratio: 0.5,
    });
    const button = await add.boundingBox();
    const tabs = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(tabs?.y ?? 0);
    expect(button?.width).toBe(button?.height);
  }
  await expectNoViolations(page);
  await saveScreenshot(page, 'bills-table');
  await add.click();
  await expect(page.getByRole('dialog', { name: 'Add bill' })).toBeVisible();
  // Nothing of the page shows over a dialog, the floating button included.
  await expect(page.locator('button[title="Add bill"]')).toBeHidden();
});
