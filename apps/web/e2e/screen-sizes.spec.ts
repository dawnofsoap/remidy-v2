import { expect, test, type Page } from '@playwright/test';
import { mockSignedIn, saveScreenshot } from './support.ts';

// Pages use the whole screen, from a small laptop to 4K, with the server mocked.
const iso = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
// A busy day in the middle of this month's grid.
const busyDay = iso(0);
const skipOnPhone = () => {
  test.skip(test.info().project.name === 'phone', 'About screens wider than a phone.');
};
const NAMES = ['Rent', 'Water', 'Electric', 'Internet', 'Phone', 'Car loan', 'Gym', 'Trash'];

const entry = (index: number) => ({
  id: `e${String(index)}`,
  billId: `b${String(index)}`,
  spaceId: 'sp1',
  shared: false,
  name: NAMES[index] ?? 'Bill',
  dueOn: busyDay,
  expectedCents: 1000,
  isVariable: false,
  categoryName: 'Utilities',
  logoId: null,
  state: 'open',
  paidCents: 0,
});

const bill = (index: number) => ({
  id: `b${String(index)}`,
  spaceId: 'sp1',
  shared: false,
  name: NAMES[index] ?? 'Bill',
  expectedCents: 1000,
  isVariable: false,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: busyDay, lastDue: null },
  categoryId: null,
  categoryName: 'Utilities',
  autopay: false,
  url: null,
  notes: null,
  logoId: null,
  archived: false,
});

async function withBills(page: Page) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({ json: { overdue: [], upcoming: NAMES.map((_, index) => entry(index)) } }),
  );
  await page.route('**/api/v1/bills', (route) =>
    route.fulfill({ json: NAMES.map((_, index) => bill(index)) }),
  );
  await page.route('**/api/v1/totals?**', (route) =>
    route.fulfill({ json: { dueCents: 0, unknownCount: 0, paidCents: 0 } }),
  );
}

test('Bills uses the whole width of a wide screen', async ({ page }) => {
  skipOnPhone();
  await page.setViewportSize({ width: 2560, height: 1440 });
  await withBills(page);
  await page.goto('/bills');
  const table = await page.getByRole('table', { name: 'Bills' }).boundingBox();
  const main = await page.getByRole('main').boundingBox();
  // Only the page's own padding is left beside the table.
  expect((main?.width ?? 0) - (table?.width ?? 0)).toBeLessThan(100);
  await saveScreenshot(page, 'bills-2560');
});

test('the calendar fills the window, and a taller one shows more bills on a day', async ({
  page,
}) => {
  skipOnPhone();
  await withBills(page);
  const busy = () =>
    page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /8 due$/ }) });
  // The "+N more" line, read once the days have their size.
  const hiddenAt = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto('/calendar');
    const more = busy().getByRole('button', { name: /more/ });
    await expect(more).toBeVisible();
    await page.waitForTimeout(300);
    return Number(/\+(\d+)/.exec((await more.textContent()) ?? '')?.[1]);
  };

  const hiddenSmall = await hiddenAt(1366, 768);
  const hiddenTall = await hiddenAt(2560, 1440);
  expect(hiddenTall).toBeLessThan(hiddenSmall);
  const grid = await page.getByRole('list', { name: /\d{4}$/ }).boundingBox();
  expect((grid?.y ?? 0) + (grid?.height ?? 0)).toBeGreaterThan(1440 - 100);
  await saveScreenshot(page, 'calendar-2560');
});
