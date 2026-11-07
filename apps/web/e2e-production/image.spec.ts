import { expect, test, type Page } from '@playwright/test';
import { ADMIN_EMAIL } from '@remidy/contracts';
import { execSync } from 'node:child_process';

// Runs against the built image behind TLS, with a new database. See playwright.production.config.ts.
const CHOSEN_PASSWORD = 'a passphrase of my own';

test.describe.configure({ mode: 'serial' });

const compose = (args: string) =>
  execSync(
    `docker compose -p remidy-prodcheck -f deploy/compose.yaml -f deploy/check/compose.yaml --env-file deploy/check/check.env ${args}`,
    { encoding: 'utf8', cwd: '../..' },
  );
const inServer = (command: string) => compose(`exec -T server sh -c "${command}"`);

function printedPassword(): string {
  const last = [...compose('logs --no-color server').matchAll(/Password: (\S+)/g)].at(-1)?.[1];
  if (!last) throw new Error('The server printed no admin password.');
  return last;
}

/** Every Content Security Policy refusal the browser reports on this page. */
function watchRefusals(page: Page): string[] {
  const refusals: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) refusals.push(message.text());
  });
  return refusals;
}

test('runs as an ordinary user, with nothing it doesn’t need', () => {
  expect(inServer('id -u').trim()).not.toBe('0');
  // Writing anywhere but /tmp fails, because the disk is read-only.
  expect(inServer('touch /app/written 2>/dev/null && echo yes || echo no').trim()).toBe('no');
  expect(inServer('command -v pnpm || echo none').trim()).toBe('none');
  expect(
    inServer(
      "find /app/apps /app/packages -path '*/node_modules' -prune -o -name '*.test.ts' -print",
    ),
  ).toBe('');
  expect(inServer('ls /app/node_modules/.pnpm')).not.toMatch(
    /^(vitest|typescript|testcontainers)@/m,
  );
  expect(inServer('ls -a /app')).not.toMatch(/notes|\.env|\.git/);
});

test('sends the protections with the page itself', async ({ request }) => {
  const headers = (await request.get('/')).headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['strict-transport-security']).toBe('max-age=31536000');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cache-control']).toBe('no-cache');
});

test('a person can sign in and use the app, and the browser refuses nothing', async ({
  page,
  context,
}) => {
  const refusals = watchRefusals(page);
  await page.goto('/');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(printedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByLabel('Temporary password').fill(printedPassword());
  await page.getByLabel('New password').fill(CHOSEN_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

  const session = (await context.cookies()).find((cookie) => cookie.name.includes('session'));
  expect(session).toMatchObject({ secure: true, httpOnly: true });

  // A page opened directly, rather than from inside the app.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  expect(refusals).toEqual([]);
});

test('really does block a script injected into the page', async ({ page }) => {
  const refusals = watchRefusals(page);
  await page.goto('/');
  const ran = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.body.dataset.injected = "yes"';
    document.body.append(script);
    return document.body.dataset.injected === 'yes';
  });
  expect(ran).toBe(false);
  expect(refusals.length).toBeGreaterThan(0);
});

test('the admin password can be reset from inside the image', async ({ page }) => {
  const output = inServer('node apps/server/src/core/auth/reset-admin-password.ts');
  const password = /Password: (\S+)/.exec(output)?.[1];
  expect(password).toBeTruthy();
  await page.goto('/');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a password', level: 1 })).toBeVisible();
});
