import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations, mockSignedIn, personal } from './support.ts';

// Screens only, with the server mocked. The real stack is covered in auth.stack.spec.ts.
const household = {
  id: 'sp2',
  name: 'The Example household',
  kind: 'shared',
  timeZone: 'America/Chicago',
  role: 'owner',
};

const internet = {
  id: 'b1',
  spaceId: 'sp1',
  shared: false,
  name: 'Internet',
  merchant: null,
  expectedCents: 6000,
  isVariable: false,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-10', lastDue: null },
  categoryId: null,
  categoryName: null,
  autopay: false,
  url: null,
  notes: null,
  logoId: null,
  archived: false,
};

async function withHousehold(page: Page) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/spaces', (route) => route.fulfill({ json: [personal, household] }));
  await page.route('**/api/v1/spaces/*/categories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/bills', (route) => route.fulfill({ json: [internet] }));
}

test('a personal bill can be shared with the household, after saying who will see it', async ({
  page,
}) => {
  await withHousehold(page);
  const calls: string[] = [];
  await page.route('**/api/v1/spaces/sp1/bills/b1', (route) => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ json: internet });
  });
  await page.route('**/api/v1/spaces/sp1/bills/b1/move', (route) => {
    const body = route.request().postDataJSON() as { toSpaceId: string };
    calls.push(`POST move ${body.toSpaceId}`);
    return route.fulfill({ json: { ...internet, spaceId: 'sp2', shared: true } });
  });

  await page.goto('/bills');
  await page.getByRole('button', { name: /Internet/ }).click();
  await page
    .getByRole('dialog', { name: 'Internet' })
    .getByRole('button', { name: 'Edit' })
    .click();
  const dialog = page.getByRole('dialog');
  const whose = dialog.getByRole('group', { name: 'Whose bill' });
  await expect(whose.getByRole('radio', { name: 'Just mine' })).toBeChecked();
  await whose.getByText('Shared with The Example household').click();
  await expect(dialog.getByRole('status')).toContainText(
    'Everyone in The Example household will see this bill',
  );
  await expectNoViolations(page);
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Saving goes back to the bill.
  await expect(page.getByRole('dialog', { name: 'Internet' })).toBeVisible();
  // Saved where it was, then moved, so the household swaps in its own category.
  expect(calls).toEqual(['PATCH /api/v1/spaces/sp1/bills/b1', 'POST move sp2']);
});

test('without a household there’s no choice to make', async ({ page }) => {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/spaces/*/categories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/bills', (route) => route.fulfill({ json: [internet] }));
  await page.goto('/bills');
  await page.getByRole('button', { name: /Internet/ }).click();
  await page
    .getByRole('dialog', { name: 'Internet' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Edit Internet' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Whose bill' })).toHaveCount(0);
});
