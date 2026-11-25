import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations, mockSignedIn, personal, saveScreenshot } from './support.ts';

// Importing from v1 with the server mocked. The routes themselves are covered in imports.test.ts.

const household = {
  id: 'sp2',
  name: 'Household',
  kind: 'shared',
  timeZone: 'America/Chicago',
  role: 'owner',
};

const previewBill = (index: number, name: string, overrides: object = {}) => ({
  index,
  name,
  expectedCents: 4500,
  isVariable: false,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-15', lastDue: null },
  scheduleText: 'Every month on the 15th',
  nextDue: '2026-12-15',
  categoryName: 'Utilities',
  autopay: false,
  shared: true,
  hasLogo: false,
  status: 'ready',
  checks: [],
  ...overrides,
});

const preview = {
  bills: [
    previewBill(0, 'Water'),
    previewBill(1, 'Gym', { shared: false, expectedCents: null, isVariable: true, autopay: true }),
    previewBill(2, 'Rent', {
      status: 'duplicate',
      checks: [
        'In v1, its reminders used day 5, but its due dates used the 15th. Check which is right.',
      ],
    }),
    previewBill(3, 'Old loan', { status: 'finished', nextDue: null }),
  ],
  skipped: [
    { name: 'Twice a month', reason: 'Its frequency, “semimonthly”, isn’t one v2 can repeat.' },
  ],
  categories: [
    { name: 'Fitness', exists: false },
    { name: 'Utilities', exists: true },
  ],
  hasHousehold: true,
};

// Made up, in the shape of v1's export. The server reads it; here it's only passed along.
const exportFile = { exportVersion: '1.0', exportDate: '2026-11-20T00:00:00.000Z', bills: [] };

async function openImport(page: Page, spaces: object[] = [personal, household]) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills', 'imports'] } }),
  );
  await page.route('**/api/v1/spaces', (route) => route.fulfill({ json: spaces }));
  await page.goto('/settings/import');
  await expect(page.getByRole('heading', { name: 'Import from v1' })).toBeVisible();
}

const chooseFile = (page: Page, contents: string, name = 'bill-tracker-export.json') =>
  page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });

test('the v1 export is reviewed, then the chosen bills are imported where they were chosen to go', async ({
  page,
}) => {
  await openImport(page);
  const sent: unknown[] = [];
  await page.route('**/api/v1/imports/preview', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: preview });
  });
  await page.route('**/api/v1/imports', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { billCount: 2, categoryCount: 1 } });
  });
  await expectNoViolations(page);
  await chooseFile(page, JSON.stringify(exportFile));

  const list = page.getByRole('list', { name: 'Bills in the export' });
  // Ready bills are chosen to start with. A likely duplicate and a finished one aren't.
  await expect(list.getByRole('checkbox', { name: 'Water' })).toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Gym' })).toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Rent' })).not.toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Old loan' })).not.toBeChecked();
  await expect(list.getByRole('checkbox', { name: 'Water' })).toHaveAccessibleDescription(
    /\$45\.00 · Every month on the 15th · Utilities\s*Next due Dec 15, 2026/,
  );
  await expect(list.getByRole('checkbox', { name: 'Gym' })).toHaveAccessibleDescription(
    /^Varies · .*Auto.pay/,
  );
  await expect(list.getByRole('checkbox', { name: 'Rent' })).toHaveAccessibleDescription(
    /already in v2.*Check which is right\./,
  );
  // Where each goes starts as it was in v1.
  await expect(page.getByRole('combobox', { name: 'Where Water goes' })).toHaveValue('household');
  await expect(page.getByRole('combobox', { name: 'Where Gym goes' })).toHaveValue('personal');
  await expect(page.getByText('New categories: Fitness')).toBeVisible();
  await expect(page.getByRole('region', { name: /Can’t be imported/ })).toContainText(
    'Twice a month: Its frequency, “semimonthly”, isn’t one v2 can repeat.',
  );
  await expectNoViolations(page);
  await saveScreenshot(page, 'import-review');

  // Water comes to the person instead, and Rent is included after all.
  await page.getByRole('combobox', { name: 'Where Water goes' }).selectOption('personal');
  await list.getByText('Rent', { exact: true }).click();
  await page.getByRole('button', { name: 'Import 3 bills' }).click();

  await expect(page.getByRole('heading', { name: 'Imported 2 bills' })).toBeVisible();
  await expect(page.getByText('1 new category was added too.')).toBeVisible();
  expect(sent).toEqual([
    { file: exportFile },
    {
      file: exportFile,
      bills: [
        { index: 0, shared: false },
        { index: 1, shared: false },
        { index: 2, shared: true },
      ],
    },
  ]);
  await page.getByRole('button', { name: 'Import another file' }).click();
  await expect(page.getByRole('button', { name: 'Choose v1 export' })).toBeVisible();
});

test('a file that isn’t an export says so, and the server’s refusal shows as it is', async ({
  page,
}) => {
  await openImport(page);
  await chooseFile(page, 'not json at all', 'notes.txt');
  await expect(page.getByRole('alert')).toHaveText(
    'That file isn’t a v1 export. In v1, export your data from Settings.',
  );

  await page.route('**/api/v1/imports/preview', (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: 'invalid',
          message: 'That file isn’t a v1 export. In v1, export your data from Settings.',
          requestId: 'r1',
          fields: [{ path: 'file', message: 'That file isn’t a v1 export.' }],
        },
      },
    }),
  );
  await chooseFile(page, JSON.stringify({ hello: 'there' }));
  await expect(page.getByRole('alert')).toContainText('isn’t a v1 export');
});

test('without a household, there’s no choice of where bills go', async ({ page }) => {
  await openImport(page, [personal]);
  await page.route('**/api/v1/imports/preview', (route) =>
    route.fulfill({
      json: {
        ...preview,
        hasHousehold: false,
        bills: [previewBill(0, 'Water', { shared: false })],
      },
    }),
  );
  await chooseFile(page, JSON.stringify(exportFile));
  await expect(page.getByRole('checkbox', { name: 'Water' })).toBeChecked();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  // Unchecking the only bill leaves nothing to import.
  await page.getByText('Water', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Import 0 bills' })).toBeDisabled();
});
