import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations, mockSignedIn, saveScreenshot, signedIn } from './support.ts';

// Finding, choosing and uploading logos, and setting up Logo.dev, with the server mocked.

// Drawn sample logos, like the ones in the sample data.
const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA+ElEQVR4nO3bTQ6CQBBEYU7hWT2Tl9TExJ1RaOh50z2vktlC1cfKH7YtmNv98ZzpRHeUHDsMhR6AQtClUQS6LIpAl0QR6HIoAl0KR6ALoQB0GRyBLiKAAIsCfIICkE+ABngj0ONpBAFmGE8iDAf4FwE6A+xNS4CjaQUQTQuAsykNcFVKAlydUgBZEUCAAgDZEUAAAQQQYGaATISMrgIIkHDRDISsnn4czrz4FQjZ/fxKbMRNIgijevnLEHHTmY4AdAH6CEAXoI8A9P+E8PECCCCAACsi+L7Aym+NfB2/CsLP8d0Rdo3vinBofDeE0PgOEKeHV0KJ7ngBJ0TVH7i9YKwAAAAASUVORK5CYII=',
  'base64',
);

async function withBills(page: Page) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/spaces/*/categories', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/bills', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/logos/*', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'image/png', body: LOGO_PNG })
      : route.fallback(),
  );
}

test('adding a bill finds its merchant’s logo, and another can be chosen', async ({ page }) => {
  await withBills(page);
  const searches: { name: string; url: string | null }[] = [];
  await page.route('**/api/v1/logos/suggest', (route) => {
    searches.push(route.request().postDataJSON() as { name: string; url: string | null });
    return route.fulfill({
      json: {
        options: [
          {
            logoId: '0198c0de-0000-7000-8000-000000000001',
            label: 'City Power',
            source: 'logo.dev',
          },
          {
            logoId: '0198c0de-0000-7000-8000-000000000002',
            label: 'power.example',
            source: 'website',
          },
        ],
      },
    });
  });
  let saved: { logoId?: string; merchant?: string | null } = {};
  await page.route('**/api/v1/spaces/*/bills', (route) => {
    saved = route.request().postDataJSON() as typeof saved;
    return route.fulfill({ status: 201, json: {} });
  });

  await page.goto('/bills');
  await page.getByRole('button', { name: 'Add bill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Electric bill');
  await dialog.getByLabel('Amount due').fill('120');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Next due date' }).fill('1/15/2030');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();

  // The logo is searched for by the merchant, not the bill's name.
  await dialog.getByLabel('Merchant (optional)').fill('City Power');
  // The first logo found is chosen on its own.
  const logo = dialog.getByRole('group', { name: 'Logo' });
  await expect(logo).toContainText('Shown beside this bill.');
  await dialog.getByLabel('Website (optional)').fill('https://power.example');
  await expect.poll(() => searches.at(-1)?.url).toBe('https://power.example');
  await saveScreenshot(page, 'bill-merchant');

  await logo.getByRole('button', { name: 'Change' }).click();
  const found = logo.getByRole('list', { name: 'Logos found' });
  await expect(found.getByRole('button', { pressed: true })).toContainText('City Power');
  await found.getByRole('button', { name: /power\.example/ }).click();
  await expect(found.getByRole('button', { pressed: true })).toContainText('power.example');
  await expectNoViolations(page);
  await saveScreenshot(page, 'logo-picker');

  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect.poll(() => saved.logoId).toBe('0198c0de-0000-7000-8000-000000000002');
  expect(saved.merchant).toBe('City Power');
  // The latest search is for the merchant, with its website.
  expect(searches.at(-1)).toEqual({ name: 'City Power', url: 'https://power.example' });
});

test('an uploaded logo that isn’t an image is refused, saying why', async ({ page }) => {
  await withBills(page);
  await page.route('**/api/v1/logos/suggest', (route) => route.fulfill({ json: { options: [] } }));
  await page.route('**/api/v1/logos', (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: 'invalid',
          message: 'Use a PNG, JPEG, GIF, WebP or ICO image.',
          requestId: 'r1',
          fields: [{ path: 'image', message: 'Use a PNG, JPEG, GIF, WebP or ICO image.' }],
        },
      },
    }),
  );
  await page.goto('/bills');
  await page.getByRole('button', { name: 'Add bill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Corner shop');
  await dialog.getByLabel('Amount due').fill('5');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Next due date' }).fill('1/15/2030');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();

  const logo = dialog.getByRole('group', { name: 'Logo' });
  await expect(logo).toContainText('No logos found');
  await logo.getByRole('button', { name: 'Change' }).click();
  const chooser = page.waitForEvent('filechooser');
  await logo.getByRole('button', { name: 'Upload your own' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg></svg>'),
  });
  await expect(logo.getByRole('alert')).toHaveText('Use a PNG, JPEG, GIF, WebP or ICO image.');
});

test('an admin sets up Logo.dev, and the keys are never shown again', async ({ page }) => {
  await mockSignedIn(page);
  await page.route('**/api/v1/auth/get-session', (route) =>
    route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, isInstanceAdmin: true } } }),
  );
  let configured = false;
  const sent: object[] = [];
  await page.route('**/api/v1/admin/settings/logo-dev', (route) => {
    if (route.request().method() === 'PUT') {
      sent.push(route.request().postDataJSON() as object);
      configured = true;
    }
    return route.fulfill({
      json: { configured, updatedAt: configured ? '2026-11-08T15:00:00.000Z' : null },
    });
  });

  await page.goto('/admin/logos');
  await expect(page.getByText('Not set up.')).toBeVisible();
  await expectNoViolations(page);
  await expect(page.getByText(/bill names are sent to Logo\.dev/)).toBeVisible();
  await page.getByLabel('Publishable key').fill('pk_test1234');
  await page.getByLabel('Secret key').fill('sk_test5678');
  await page.getByRole('button', { name: 'Save keys' }).click();

  await expect(page.getByText(/^Set up, last changed/)).toBeVisible();
  await expect(page.getByLabel('Secret key')).toHaveValue('');
  expect(sent).toEqual([{ publishableKey: 'pk_test1234', secretKey: 'sk_test5678' }]);
  await saveScreenshot(page, 'admin-logos');
});
