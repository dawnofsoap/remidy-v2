import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

// Runs against the real server and database, with nothing mocked, in the order a person would.
// It reads the real console, so it needs the Docker stack and a brand-new database. To run it again
// locally: docker compose down -v && docker compose up
const CHOSEN_PASSWORD = 'a passphrase of my own';
const SECOND_PASSWORD = 'a different long passphrase';

test.describe.configure({ mode: 'serial' });

const compose = (args: string) =>
  execSync(`docker compose ${args}`, { encoding: 'utf8', cwd: '../..' });

function passwordIn(output: string): string {
  const matches = [...output.matchAll(/Password: (\S+)/g)];
  const last = matches.at(-1)?.[1];
  if (!last) throw new Error('The server printed no admin password.');
  return last;
}

async function signInWith(page: Page, password: string) {
  await page.getByLabel('Email or username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function replacePassword(page: Page, temporary: string, chosen: string) {
  await page.getByLabel('Temporary password').fill(temporary);
  await page.getByLabel('New password').fill(chosen);
  await page.getByRole('button', { name: 'Save password' }).click();
}

const appHeading = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 });

test('the first start prints the admin password, which must then be replaced', async ({
  page,
  request,
}) => {
  const options = (await (await request.get('/api/sign-in-options')).json()) as {
    adminPasswordInConsole: boolean;
  };
  test.skip(!options.adminPasswordInConsole && !process.env.CI, 'Needs a new database');
  expect(options.adminPasswordInConsole).toBe(true);
  const printed = passwordIn(compose('logs --no-color server'));

  await page.goto('/');
  await expect(page.getByText('printed in the server’s console')).toBeVisible();
  await signInWith(page, printed);
  await expect(appHeading(page, 'Choose a password')).toBeVisible();

  // Nothing else works yet, even when asked for directly.
  const refused = await page.request.get('/api/spaces');
  expect([403, 404]).toContain(refused.status());

  await replacePassword(page, printed, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
});

test('the generated password no longer works once replaced', async ({ page }) => {
  const printed = passwordIn(compose('logs --no-color server'));
  await page.goto('/');
  await expect(page.getByText('printed in the server’s console')).toHaveCount(0);
  await signInWith(page, printed);
  await expect(page.getByRole('alert')).toContainText('isn’t right');
});

test('the password never reaches the request logs', () => {
  const printed = passwordIn(compose('logs --no-color server'));
  const lines = compose('logs --no-color server').split('\n');
  const mentions = lines.filter((line) => line.includes(printed));
  expect(mentions).toHaveLength(1);
  expect(mentions[0]).toContain('Password: ');
  expect(lines.join('\n')).not.toContain(CHOSEN_PASSWORD);
});

test('the session cookie is out of reach of scripts', async ({ page, context }) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
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

test('a session survives a reload, and settings hide the placeholder email', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.reload();
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByText('remidy.invalid')).toHaveCount(0);
});

test('a wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, 'not the right password');
  await expect(page.getByRole('alert')).toHaveText('That username, email or password isn’t right.');
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('changing the password replaces the old one and signs out other devices', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();

  const otherDevice = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const otherPage = await otherDevice.newPage();
  await otherPage.goto('/');
  await signInWith(otherPage, CHOSEN_PASSWORD);
  await expect(appHeading(otherPage, 'Home')).toBeVisible();

  await page.goto('/settings');
  const newPassword = page.getByLabel('New password');
  await page.getByLabel('Current password').fill('not my password at all');
  await newPassword.fill('too short');
  await expect(newPassword).toHaveAttribute('aria-invalid', 'true');
  await newPassword.fill(SECOND_PASSWORD);
  await expect(newPassword).not.toHaveAttribute('aria-invalid');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toContainText('isn’t right');

  await page.getByLabel('Current password').fill(CHOSEN_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  await otherPage.reload();
  await expect(appHeading(otherPage, 'Sign in')).toBeVisible();
  await otherDevice.close();
});

test('signing out ends the session, and the old password no longer works', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(page.getByRole('alert')).toBeVisible();

  await signInWith(page, SECOND_PASSWORD);
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
  await signInWith(page, SECOND_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Wait 15 minutes');
});

test('a lost admin password can always be replaced from the server', async ({ page }) => {
  // Still locked out from the test above, which this has to clear as well.
  const fresh = passwordIn(
    compose('exec -T server pnpm --filter @remidy/server reset-admin-password'),
  );

  await page.goto('/');
  await expect(page.getByText('printed in the server’s console')).toBeVisible();
  await signInWith(page, SECOND_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('isn’t right');

  await signInWith(page, fresh);
  await expect(appHeading(page, 'Choose a password')).toBeVisible();
  await replacePassword(page, fresh, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
});
