import { expect, test } from '@playwright/test';
import { expectNoViolations, mockSignedIn, saveScreenshot } from './support.ts';

// Opening a bill shows it without changing anything, with the server mocked.
const rent = {
  id: 'b1',
  spaceId: 'sp1',
  shared: false,
  name: 'Rent',
  merchant: 'Maple Street Properties',
  expectedCents: 145_000,
  isVariable: false,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-01', lastDue: null },
  categoryId: null,
  categoryName: 'Housing',
  autopay: true,
  url: 'https://maple.example/portal',
  notes: 'Paid through the tenant portal.',
  logoId: null,
  archived: false,
};

test('opening a bill shows it, and editing it is a choice', async ({ page }) => {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/spaces/*/categories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/bills', (route) => route.fulfill({ json: [rent] }));
  await page.route('**/api/v1/spaces/*/bills/*/history', (route) =>
    route.fulfill({
      json: [
        {
          id: 'o1',
          dueOn: '2026-11-01',
          state: 'skipped',
          expectedCents: 145_000,
          isVariable: false,
          payments: [],
        },
      ],
    }),
  );

  await page.goto('/bills');
  await page.getByRole('button', { name: /^Rent/ }).filter({ visible: true }).click();
  const preview = page.getByRole('dialog', { name: 'Rent' });
  await expect(preview).toContainText('$1,450.00');
  await expect(preview).toContainText('Maple Street Properties');
  await expect(preview).toContainText('Monthly on the 1st');
  await expect(preview).toContainText('Housing');
  await expect(preview).toContainText('Yes, auto-pay');
  await expect(preview).toContainText('Paid through the tenant portal.');
  await expect(preview.getByRole('link', { name: 'maple.example' })).toHaveAttribute(
    'href',
    'https://maple.example/portal',
  );
  await expect(preview.getByRole('region', { name: 'History' })).toBeVisible();
  // Nothing in it can be typed into.
  await expect(preview.getByRole('textbox')).toHaveCount(0);
  await expectNoViolations(page);
  await saveScreenshot(page, 'bill-preview');

  // Edit opens the steps, and cancelling goes back to the bill.
  await preview.getByRole('button', { name: 'Edit' }).click();
  const editing = page.getByRole('dialog', { name: 'Edit Rent' });
  await expect(editing.getByLabel('Name')).toHaveValue('Rent');
  await editing.getByRole('button', { name: 'Cancel' }).click();
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
