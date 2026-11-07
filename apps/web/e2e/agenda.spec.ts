import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations, mockSignedIn, saveScreenshot } from './support.ts';

// Home and Bills with the server mocked. The real stack is covered in auth.stack.spec.ts.
const iso = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const entry = (id: string, name: string, dueOn: string, expectedCents: number | null) => ({
  id,
  billId: id,
  shared: false,
  name,
  dueOn,
  expectedCents,
  isVariable: expectedCents === null,
  categoryName: 'Utilities',
  state: 'open',
  paidCents: 0,
});

const bill = (id: string, name: string, expectedCents: number | null) => ({
  id,
  spaceId: 'sp1',
  shared: false,
  name,
  expectedCents,
  isVariable: expectedCents === null,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-15', lastDue: null },
  categoryId: null,
  categoryName: 'Utilities',
  autopay: false,
  url: null,
  notes: null,
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
    route.fulfill({ json: [bill('b1', 'Rent', 145_000), bill('b2', 'Electric', null)] }),
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
    await table.getByRole('button', { name: /^Rent/ }).click();
    await expect(page.getByRole('dialog', { name: 'Edit Rent' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('button', { name: 'Add bill' })).toBeVisible();
  await expectNoViolations(page);
  await saveScreenshot(page, 'bills-table');
});
