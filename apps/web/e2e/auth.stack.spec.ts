import { expect, test, type Page } from '@playwright/test';

// Runs against the real server and database, with nothing mocked, in the order a person would.
// It needs a brand-new database. To run it again locally: docker compose down -v && docker compose up
const ACCOUNT = {
  name: 'Alex Example',
  email: 'alex@example.com',
  password: 'correct horse battery',
};
const NEW_PASSWORD = 'a different long password';

test.describe.configure({ mode: 'serial' });

async function signInWith(page: Page, password: string) {
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const appHeading = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 });

test('first-run setup creates the account and signs in', async ({ page, request }) => {
  const status = (await (await request.get('/api/setup')).json()) as { needed: boolean };
  test.skip(!status.needed && !process.env.CI, 'Needs a new database; see the note above');
  expect(status.needed).toBe(true);

  await page.goto('/');
  await expect(appHeading(page, 'Set up Remidy')).toBeVisible();
  await page.getByLabel('Your name').fill(ACCOUNT.name);
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password').fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(appHeading(page, 'Home')).toBeVisible();
});

test('setup cannot run twice', async ({ request }) => {
  const response = await request.post('/api/setup', {
    headers: { origin: 'http://localhost:5173' },
    data: { name: 'Mallory', email: 'mallory@example.com', password: 'a long enough password' },
  });
  expect(response.status()).toBe(409);
});

test('the session cookie is out of reach of scripts', async ({ page, context }) => {
  await page.goto('/');
  await signInWith(page, ACCOUNT.password);
  await expect(appHeading(page, 'Home')).toBeVisible();

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name.includes('session_token'));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('session_token');

  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain('session');
});

test('a session survives a reload, and shows the account in settings', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, ACCOUNT.password);
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.reload();
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText(ACCOUNT.email)).toBeVisible();
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, 'not the right password');
  await expect(page.getByRole('alert')).toHaveText('That email or password isn’t right.');
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('changing the password replaces the old one and signs out other devices', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signInWith(page, ACCOUNT.password);
  await expect(appHeading(page, 'Home')).toBeVisible();

  const otherDevice = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const otherPage = await otherDevice.newPage();
  await otherPage.goto('/');
  await signInWith(otherPage, ACCOUNT.password);
  await expect(appHeading(otherPage, 'Home')).toBeVisible();

  await page.goto('/settings');
  await page.getByLabel('Current password').fill('not my password at all');
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toContainText('isn’t right');

  await page.getByLabel('Current password').fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  await otherPage.reload();
  await expect(appHeading(otherPage, 'Sign in')).toBeVisible();
  await otherDevice.close();
});

test('signing out ends the session, and the old password no longer works', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, ACCOUNT.password);
  await expect(page.getByRole('alert')).toBeVisible();

  await signInWith(page, NEW_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(appHeading(page, 'Sign in')).toBeVisible();

  await page.reload();
  await expect(appHeading(page, 'Sign in')).toBeVisible();
});

test('repeated failures lock the account, in the real app', async ({ page }) => {
  await page.goto('/');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await signInWith(page, `wrong password number ${String(attempt)}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  }
  await signInWith(page, NEW_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Wait 15 minutes');
});
