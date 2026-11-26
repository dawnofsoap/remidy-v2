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

test('opening a bill shows it, and editing it is a choice', async ({ page }, info) => {
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
  const preview = page.getByRole('dialog', { name: 'Rent', exact: true });
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
  // Archive and delete are icons on the left, named for screen readers, and Edit is last, in the
  // bottom-right corner. On a phone, Edit is full width above them instead, nearest the thumb.
  // Closing is the ✕ in the top corner, so there's no Close beside Edit.
  const box = async (name: string) => {
    const found = await preview.getByRole('button', { name, exact: true }).boundingBox();
    if (!found) throw new Error(`${name} isn't showing`);
    return found;
  };
  expect((await box('Archive')).x).toBeLessThan((await box('Delete…')).x);
  if (info.project.name === 'phone') {
    expect((await box('Edit')).y).toBeLessThan((await box('Archive')).y);
  } else {
    expect((await box('Delete…')).x).toBeLessThan((await box('Edit')).x);
  }
  await expect(preview.getByRole('button', { name: 'Close' })).toHaveCount(1);
  await expect(preview.getByRole('button', { name: 'Close' })).toHaveText('');
  await expect(preview.getByRole('button', { name: 'Archive' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Delete…' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Archive' })).toHaveAttribute(
    'title',
    /no new due dates/,
  );
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

  // Deleting asks first, in place of the buttons, and can be called off.
  await preview.getByRole('button', { name: 'Delete…' }).click();
  const confirm = preview.getByRole('group', { name: 'Confirm delete' });
  await expect(confirm).toContainText('Delete Rent and its due dates?');
  await expect(preview.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expectNoViolations(page);
  await saveScreenshot(page, 'bill-preview-delete');
  await confirm.getByRole('button', { name: 'Keep it' }).click();

  await preview.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
