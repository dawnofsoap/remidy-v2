import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations, mockSignedIn, saveScreenshot } from './support.ts';

// Home and Bills with the server mocked. The real stack is covered in auth.stack.spec.ts.
const iso = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// A drawn sample logo, like the ones in the sample data.
const LOGO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA+ElEQVR4nO3bTQ6CQBBEYU7hWT2Tl9TExJ1RaOh50z2vktlC1cfKH7YtmNv98ZzpRHeUHDsMhR6AQtClUQS6LIpAl0QR6HIoAl0KR6ALoQB0GRyBLiKAAIsCfIICkE+ABngj0ONpBAFmGE8iDAf4FwE6A+xNS4CjaQUQTQuAsykNcFVKAlydUgBZEUCAAgDZEUAAAQQQYGaATISMrgIIkHDRDISsnn4czrz4FQjZ/fxKbMRNIgijevnLEHHTmY4AdAH6CEAXoI8A9P+E8PECCCCAACsi+L7Aym+NfB2/CsLP8d0Rdo3vinBofDeE0PgOEKeHV0KJ7ngBJ0TVH7i9YKwAAAAASUVORK5CYII=';
// Water has a logo, so the screens show both a logo and a lettered tile.
const logoOf = (name: string) => (name === 'Water' ? 'l1' : null);

// The mocked bills, so a due date opens its own bill.
const BILL_IDS: Record<string, string> = { Rent: 'b1', Electric: 'b2', Water: 'b3' };

const entry = (id: string, name: string, dueOn: string, expectedCents: number | null) => ({
  id,
  billId: BILL_IDS[name] ?? id,
  spaceId: 'sp1',
  shared: false,
  name,
  dueOn,
  expectedCents,
  isVariable: expectedCents === null,
  categoryName: 'Utilities',
  logoId: logoOf(name),
  state: 'open',
  paidCents: 0,
});

const bill = (id: string, name: string, expectedCents: number | null) => ({
  id,
  spaceId: 'sp1',
  shared: false,
  name,
  merchant: null,
  expectedCents,
  isVariable: expectedCents === null,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-15', lastDue: null },
  categoryId: null,
  categoryName: 'Utilities',
  autopay: false,
  url: null,
  notes: null,
  logoId: logoOf(name),
  archived: false,
});

async function withBills(page: Page) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [entry('o1', 'Rent', iso(-3), 145_000)],
        upcoming: [entry('u1', 'Water', iso(2), 4_500), entry('u2', 'Electric', iso(5), null)],
      },
    }),
  );
  await page.route('**/api/v1/bills', (route) =>
    route.fulfill({
      json: [bill('b1', 'Rent', 145_000), bill('b2', 'Electric', null), bill('b3', 'Water', 4_500)],
    }),
  );
  await page.route('**/api/v1/logos/*', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(LOGO_PNG, 'base64') }),
  );
}

test('Home sums up the month beside what’s due, or above it on a phone', async ({ page }, info) => {
  await withBills(page);
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'This month' });
  await expect(summary).toContainText('Overdue');
  await expect(summary).toContainText('$1,450.00');
  await expect(summary).toContainText('$45.00 + 1 that varies');

  const list = await page.getByRole('list', { name: 'Overdue' }).boundingBox();
  const panel = await summary.boundingBox();
  if (info.project.name === 'phone') {
    expect(panel?.y ?? 0).toBeLessThan(list?.y ?? 0);
  } else {
    expect(panel?.x ?? 0).toBeGreaterThan((list?.x ?? 0) + (list?.width ?? 0));
  }
  await expectNoViolations(page);
  await saveScreenshot(page, 'home-summary');
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
    await expect(page.getByRole('dialog', { name: 'Rent' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('button', { name: 'Add bill' })).toBeVisible();
  await expectNoViolations(page);
  await saveScreenshot(page, 'bills-table');
});

test('the calendar shows the month as a grid, or as a list of days on a phone', async ({
  page,
}, info) => {
  await withBills(page);
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 0 } }),
  );
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
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
  const preview = page.getByRole('dialog', { name: 'Water' });
  await expect(preview.getByRole('region', { name: 'This due date' })).toContainText('$45.00');
  await expectNoViolations(page);
  await saveScreenshot(page, 'calendar-bill');
  await preview.getByRole('button', { name: 'Pay' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pay Water' });
  await expect(dialog.getByLabel('Amount paid')).toHaveValue('45.00');
  await expect(dialog.getByRole('button', { name: 'Skip this one' })).toBeVisible();
  await expectNoViolations(page);
});

test('a day with more bills than fit lists them all, most urgent first', async ({ page }, info) => {
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
  // Three fit, paid last, so the fourth is behind "+1 more".
  await page.getByRole('button', { name: /^\+1 more/ }).click();
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
