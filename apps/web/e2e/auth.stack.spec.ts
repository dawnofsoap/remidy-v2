import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_EMAIL } from '@remidy/contracts';
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
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function replacePassword(page: Page, temporary: string, chosen: string) {
  await page.getByLabel('Temporary password').fill(temporary);
  await page.getByLabel('New password').fill(chosen);
  await page.getByRole('button', { name: 'Save password' }).click();
}

const appHeading = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 });

/** Goes to a section of Settings the way a person would, from the sidebar. */
async function openSettings(page: Page, section: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(appHeading(page, 'Settings')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: section })
    .click();
  await expect(page.getByRole('heading', { name: section, level: 2 })).toBeVisible();
}

test('the first start prints the admin password, which must then be replaced', async ({
  page,
  request,
}) => {
  const options = (await (await request.get('/api/v1/sign-in-options')).json()) as {
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
  const refused = await page.request.get('/api/v1/spaces');
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

test('a session survives a reload, and shows the account in settings', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.reload();
  await expect(appHeading(page, 'Home')).toBeVisible();

  await page.goto('/settings/profile');
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
});

test('a personal space exists, using the browser time zone, and its time zone can change', async ({
  page,
}) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
  await openSettings(page, 'Time zone');

  const browserZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const field = page.getByRole('combobox', { name: 'Time zone' });
  await expect(field).toHaveValue(browserZone);

  const next = browserZone === 'Asia/Tokyo' ? 'Europe/Paris' : 'Asia/Tokyo';
  await field.selectOption(next);
  await expect(page.getByText('Time zone saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Time zone' })).toHaveValue(next);
});

test('the real job runner reports its heartbeat to the admin', async ({ page }) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
  await page.goto('/admin/jobs');
  const row = page
    .getByRole('listitem')
    .filter({ hasText: 'Shows that background jobs are running.' });
  await expect(row.getByText('Working')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Removes expired sessions')).toBeVisible();
});

test('categories can be added, renamed, archived and deleted, at desktop and phone sizes', async ({
  page,
}) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
  await openSettings(page, 'Categories');

  const list = page.getByRole('list', { name: 'Categories', exact: true });
  const dialog = page.getByRole('dialog');
  const row = (name: string) => list.getByRole('button', { name, exact: true });
  await expect(row('Utilities')).toBeVisible();

  // Add, then rename. A duplicate is refused on the field, whatever its case.
  await page.getByRole('button', { name: 'Add category' }).click();
  await dialog.getByLabel('Name').fill('Pets');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(row('Pets')).toBeVisible();

  await row('Pets').click();
  await dialog.getByLabel('Name').fill('utilities');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('There’s already a category with this name.')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  await dialog.getByLabel('Name').fill('Animals');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(row('Animals')).toBeVisible();

  // Archive and restore.
  await row('Animals').click();
  await dialog.getByRole('button', { name: 'Archive' }).click();
  await expect(row('Animals')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show archived (1)' }).click();
  const archived = page.getByRole('list', { name: 'Archived categories' });
  await archived.getByRole('button', { name: 'Animals' }).click();
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(row('Animals')).toBeVisible();

  // On a phone the same editor is a bottom sheet, and deleting asks first.
  await page.setViewportSize({ width: 390, height: 844 });
  await row('Animals').click();
  const sheet = await dialog.boundingBox();
  expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeCloseTo(844, 0);
  await dialog.getByRole('button', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await dialog.getByRole('button', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row('Animals')).toHaveCount(0);

  await page.reload();
  await expect(row('Utilities')).toBeVisible();
  await expect(row('Animals')).toHaveCount(0);
});

test('a bill is added in steps, shows on Home, and can be edited, at desktop and phone sizes', async ({
  page,
}) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Bills' }).click();
  await expect(appHeading(page, 'Bills')).toBeVisible();

  const dialog = page.getByRole('dialog');
  const next = () => dialog.getByRole('button', { name: 'Next', exact: true }).click();
  const step = (text: string) =>
    expect(dialog.getByRole('navigation', { name: 'Steps' })).toContainText(text);

  // Each step checks its own fields before moving on.
  await page.getByRole('button', { name: 'Add bill' }).click();
  await step('Step 1 of 3');
  await next();
  await expect(dialog.getByText('Enter a name.')).toBeVisible();
  await dialog.getByLabel('Name').fill('Water');
  await dialog.getByLabel('Amount due').fill('45');
  await next();

  // Due on the 31st, so later dates land on shorter months' last days.
  await step('Step 2 of 3');
  await dialog.getByRole('combobox', { name: 'Repeats' }).selectOption('monthly');
  await dialog.getByRole('textbox', { name: 'Next due date' }).fill('1/31/2030');
  await expect(dialog.getByText(/Monthly on the last day/)).toBeVisible();
  await next();

  await step('Step 3 of 3');
  await dialog
    .getByRole('combobox', { name: 'Category (optional)' })
    .selectOption({ label: 'Utilities' });
  await expect(dialog.getByRole('region', { name: 'Summary' })).toContainText('$45.00');
  // Back keeps what was entered.
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Next due date' })).toHaveValue('1/31/2030');
  await next();
  await dialog.getByRole('button', { name: 'Add bill' }).click();

  // A table on desktop, and a list on a phone.
  const table = page.getByRole('table', { name: 'Bills' });
  const bills = page.getByRole('list', { name: 'Bills', exact: true });
  await expect(table.getByRole('row', { name: /Water/ })).toContainText('$45.00');
  await expect(table.getByRole('row', { name: /Water/ })).toContainText('Utilities');

  // One due in a few days shows on Home. The space's time zone was changed earlier, so its
  // "today" may not be the browser's, and a date a few days out is upcoming either way.
  await page.getByRole('button', { name: 'Add bill' }).click();
  await dialog.getByLabel('Name').fill('Phone');
  await dialog.getByRole('group', { name: 'Amount' }).getByText('Varies').click();
  await next();
  await dialog.getByRole('combobox', { name: 'Repeats' }).selectOption('once');
  const soon = await page.evaluate(() => {
    const date = new Date(Date.now() + 3 * 86_400_000);
    return `${String(date.getMonth() + 1)}/${String(date.getDate())}/${String(date.getFullYear())}`;
  });
  await dialog.getByRole('textbox', { name: 'Due date' }).fill(soon);
  await next();
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(table.getByRole('row', { name: /Phone/ })).toContainText('Varies');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('main')).toContainText('Phone');
  await expect(page.getByRole('list', { name: 'Overdue' })).toHaveCount(0);

  // Paying it from Home, in part and then the rest, then seeing it on the calendar.
  await page.getByRole('button', { name: /Phone/ }).click();
  await dialog.getByLabel('Amount paid').fill('20');
  await dialog.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByRole('button', { name: /Phone/ })).toContainText('Paid $20.00');
  await expect(page.getByRole('region', { name: 'This month' })).toContainText('Paid this month');

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Calendar' })
    .click();
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Phone');

  // Its history shows the payment, which can be voided with a reason and stays listed.
  await page.goto('/bills');
  await table.getByRole('row', { name: /Phone/ }).click();
  await dialog.getByRole('button', { name: 'Go to History' }).click();
  await dialog.getByRole('button', { name: 'Void…' }).click();
  await dialog.getByLabel('Why void it?').fill('Wrong bill');
  await dialog.getByRole('button', { name: 'Void payment' }).click();
  await expect(dialog.getByText('Wrong bill')).toBeVisible();
  await page.keyboard.press('Escape');

  // On a phone, editing is a bottom sheet with the steps as tabs, and saves from any of them.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/bills');
  await bills.getByRole('button', { name: /Water/ }).click();
  const sheet = await dialog.boundingBox();
  expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeCloseTo(844, 0);
  await dialog.getByLabel('Name').fill('Water and sewer');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(bills.getByRole('button', { name: /Water and sewer/ })).toBeVisible();

  // A bill with payments, even voided ones, keeps its history: it can be archived, not deleted.
  await bills.getByRole('button', { name: /Phone/ }).click();
  await dialog.getByRole('button', { name: 'Go to Details' }).click();
  await dialog.getByRole('button', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Archive it instead');
  await dialog.getByRole('button', { name: 'Archive' }).click();
  await expect(bills.getByRole('button', { name: /Phone/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show archived (1)' })).toBeVisible();
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
  baseURL,
}) => {
  await page.goto('/');
  await signInWith(page, CHOSEN_PASSWORD);
  await expect(appHeading(page, 'Home')).toBeVisible();

  const otherDevice = await browser.newContext(baseURL ? { baseURL } : {});
  const otherPage = await otherDevice.newPage();
  await otherPage.goto('/');
  await signInWith(otherPage, CHOSEN_PASSWORD);
  await expect(appHeading(otherPage, 'Home')).toBeVisible();

  await page.goto('/settings/security');
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

  await page.goto('/settings/security');
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

test('someone with an email address can reset a forgotten password', async ({ page, context }) => {
  // Added directly, because invitations don't exist yet. Mail goes to the console in development.
  const email = 'alex@example.com';
  compose(
    `exec -T db psql -U remidy -d remidy -c "insert into \\"user\\" (id, name, email) values ('reset-test', 'Alex', '${email}')"`,
  );

  // This file signs in more than 20 times a minute from one address, which the real limit refuses.
  compose('exec -T db psql -U remidy -d remidy -c "delete from rate_limit"');
  await context.clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toContainText(email);

  const findLink = () =>
    /https?:\S+reset-password#token=\S+/.exec(compose('logs --no-color server'))?.[0];
  await expect.poll(findLink).toBeTruthy();
  const link = String(findLink());
  await page.goto(link);
  await page.getByLabel('New password').fill(SECOND_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(appHeading(page, 'Sign in')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(SECOND_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(appHeading(page, 'Home')).toBeVisible();

  // The link has been used.
  await page.goto(link);
  await page.getByLabel('New password').fill(CHOSEN_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
});
