import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const healthy = { status: 'ok', database: 'up' };

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(
    violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
}

async function saveScreenshot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: join(dir, `${test.info().project.name}-${name}.png`) });
}

const visibleNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });

const signedIn = {
  user: {
    id: 'u1',
    name: 'Alex Example',
    email: 'alex@example.com',
    mustChangePassword: false,
    isInstanceAdmin: false,
  },
  session: { id: 's1' },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: healthy }));
  await page.route('**/api/v1/features', (route) => route.fulfill({ json: { enabled: [] } }));
  await page.route('**/api/v1/sign-in-options', (route) =>
    route.fulfill({ json: { adminPasswordInConsole: false, passwordReset: true } }),
  );
  await page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: signedIn }));
  await page.route('**/api/v1/spaces', (route) =>
    route.fulfill({
      json: [
        {
          id: 'sp1',
          name: 'Personal',
          kind: 'personal',
          timeZone: 'America/Chicago',
          role: 'owner',
        },
      ],
    }),
  );
  await page.route('**/api/v1/auth/list-sessions', (route) =>
    route.fulfill({ json: [{ id: 's1' }] }),
  );
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('remidy.theme', value);
      }, theme);
    });

    for (const [name, path, heading] of [
      ['home', '/', 'Home'],
      ['settings', '/settings', 'Settings'],
      ['not found', '/does-not-exist', 'Page not found'],
    ] as const) {
      test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
        await expect(page).toHaveTitle(`${heading} · Remidy`);
        await expectNoViolations(page);
        await saveScreenshot(page, `shell-${name.replace(' ', '-')}-${theme}`);
      });
    }
  });
}

test('exactly one navigation shows, in the right place for the screen', async ({ page }, info) => {
  await page.goto('/');
  await expect(visibleNav(page)).toHaveCount(1);
  const box = await visibleNav(page).boundingBox();
  if (info.project.name === 'phone') {
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(844);
  } else {
    expect(box?.x).toBe(0);
  }
});

test('navigating updates the page, marks the link, and moves focus to the content', async ({
  page,
}) => {
  await page.goto('/');
  const nav = visibleNav(page);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Settings' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toBeFocused();

  // The current page reads differently from the others, not only by its background.
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCSS('font-weight', '600');
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveCSS('font-weight', '500');
});

test('going straight to a page works, and back returns', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await visibleNav(page).getByRole('link', { name: 'Home' }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('the skip link is first and jumps to the content', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Keyboard behavior');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test.describe('appearance setting', () => {
  const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = 'rgb(246, 246, 247)';
  const DARK = 'rgb(15, 15, 17)';

  test('applies immediately and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await expect(page.getByRole('radio', { name: 'Match system' })).toBeChecked();
    expect(await background(page)).toBe(LIGHT);

    await page.getByText('Dark', { exact: true }).click();
    await expect.poll(() => background(page)).toBe(DARK);

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await background(page)).toBe(DARK);
  });

  test('match system follows the system setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.setItem('remidy.theme', 'light');
    });
    await page.goto('/settings');
    expect(await background(page)).toBe(LIGHT);

    await page.getByText('Match system', { exact: true }).click();
    await expect.poll(() => background(page)).toBe(DARK);
  });

  test('can be changed with the keyboard', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'Match system' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
  });
});

test.describe('signing in', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: null }));
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`the sign-in page has no violations in ${theme}`, async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('remidy.theme', value);
      }, theme);
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
      await expect(page).toHaveTitle('Sign in · Remidy');
      await expectNoViolations(page);
      await saveScreenshot(page, `sign-in-${theme}`);
    });
  }

  test('shows nothing from the app until signed in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('a wrong password gets a message that reveals nothing, and no violations', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/sign-in/email', (route) =>
      route.fulfill({ status: 401, json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' } }),
    );
    await page.goto('/');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByLabel('Password').fill('wrong password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('That email or password isn’t right.');
    await expectNoViolations(page);
  });

  test('a locked account is told to wait', async ({ page }) => {
    await page.route('**/api/v1/auth/sign-in/email', (route) =>
      route.fulfill({
        status: 429,
        json: { error: { code: 'too_many_attempts', message: 'x', requestId: 'abcdefgh' } },
      }),
    );
    await page.goto('/');
    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByLabel('Password').fill('wrong password');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Wait 15 minutes');
  });
});

test.describe('background job status', () => {
  const asAdmin = (page: Page) =>
    page.route('**/api/v1/auth/get-session', (route) =>
      route.fulfill({
        json: { ...signedIn, user: { ...signedIn.user, isInstanceAdmin: true } },
      }),
    );

  test('is hidden from people who aren’t instance admins', async ({ page }) => {
    let asked = false;
    await page.route('**/api/v1/admin/jobs', (route) => {
      asked = true;
      return route.abort();
    });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Devices' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Background jobs' })).toHaveCount(0);
    expect(asked).toBe(false);
  });

  test('shows each state in words, with no violations', async ({ page }) => {
    await asAdmin(page);
    const job = (state: string, description: string, failed: string | null = null) => ({
      name: description,
      description,
      state,
      lastSucceededAt: state === 'waiting' ? null : '2026-01-05T20:30:00.000Z',
      lastFailedAt: failed,
    });
    await page.route('**/api/v1/admin/jobs', (route) =>
      route.fulfill({
        json: [
          job('ok', 'A working job'),
          job('waiting', 'A new job'),
          job('late', 'A late job'),
          job('failing', 'A failing job', '2026-01-06T20:30:00.000Z'),
        ],
      }),
    );
    await page.goto('/settings');
    const list = page.getByRole('list', { name: 'Background jobs' });
    await expect(list.getByText('Working', { exact: true })).toBeVisible();
    await expect(list.getByText('Hasn’t run yet')).toBeVisible();
    await expect(list.getByText('Late', { exact: true })).toBeVisible();
    await expect(list.getByText('Failing', { exact: true })).toBeVisible();
    await expect(list.getByText('The server logs have the details')).toBeVisible();
    await expectNoViolations(page);
    await saveScreenshot(page, 'job-status');
  });

  test('says so when the status can’t be loaded', async ({ page }) => {
    await asAdmin(page);
    await page.route('**/api/v1/admin/jobs', (route) => route.abort());
    await page.goto('/settings');
    // The app tries a few times before giving up.
    await expect(page.getByRole('alert')).toContainText('couldn’t be loaded', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('first sign-in', () => {
  test('leaves the email empty once the admin has chosen a password', async ({ page }) => {
    await page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: null }));
    await page.goto('/');
    await expect(page.getByLabel('Email')).toHaveValue('');
  });

  test('says where to find the admin password, with no violations', async ({ page }) => {
    await page.route('**/api/v1/sign-in-options', (route) =>
      route.fulfill({ json: { adminPasswordInConsole: true, passwordReset: true } }),
    );
    await page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: null }));
    await page.goto('/');
    await expect(page.getByText('printed in the server’s console')).toBeVisible();
    await expect(page.getByText('reset-admin-password')).toBeVisible();
    const email = page.getByLabel('Email');
    await expect(email).toHaveValue('admin@remidy.local');
    await email.fill('someone@example.com');
    await expect(email).toHaveValue('someone@example.com');
    await expectNoViolations(page);
    await saveScreenshot(page, 'first-sign-in');
  });

  test('asks for a new password before anything else, with no violations', async ({ page }) => {
    await page.route('**/api/v1/auth/get-session', (route) =>
      route.fulfill({
        json: { ...signedIn, user: { ...signedIn.user, mustChangePassword: true } },
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choose a password', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);

    const field = page.getByLabel('New password');
    await field.fill('too short');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('This password doesn’t meet every requirement yet.')).toBeVisible();
    await expectNoViolations(page);
    await saveScreenshot(page, 'choose-password');

    let submitted = false;
    await page.route('**/api/v1/auth/change-password', (route) => {
      submitted = true;
      return route.fulfill({ json: { token: null } });
    });
    await page.getByLabel('Temporary password').fill('the temporary one');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(field).toBeFocused();
    expect(submitted).toBe(false);

    await field.fill('tulip-cactus-river');
    await expect(field).not.toHaveAttribute('aria-invalid');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect.poll(() => submitted).toBe(true);
  });

  test('shows a problem from the server beside the new password', async ({ page }) => {
    await page.route('**/api/v1/auth/get-session', (route) =>
      route.fulfill({
        json: { ...signedIn, user: { ...signedIn.user, mustChangePassword: true } },
      }),
    );
    await page.route('**/api/v1/auth/change-password', (route) =>
      route.fulfill({
        status: 422,
        json: {
          error: {
            code: 'validation_failed',
            message: 'Check the highlighted fields and try again.',
            requestId: 'abcdefgh',
            fields: [{ path: 'body.newPassword', message: 'Choose a different password.' }],
          },
        },
      }),
    );
    await page.goto('/');
    await page.getByLabel('Temporary password').fill('tulip-cactus-river');
    await page.getByLabel('New password').fill('tulip-cactus-river');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByLabel('New password')).toHaveAccessibleDescription(
      /Choose a different password/,
    );
    await expect(page.getByLabel('New password')).toHaveAttribute('aria-invalid', 'true');
    await expectNoViolations(page);
  });
});

test.describe('forgetting a password', () => {
  const noSession = (page: Page) =>
    page.route('**/api/v1/auth/get-session', (route) => route.fulfill({ json: null }));

  test('asks for an address, then gives an answer that reveals nothing', async ({ page }) => {
    await noSession(page);
    let asked: unknown = null;
    await page.route('**/api/v1/auth/request-password-reset', (route) => {
      asked = route.request().postDataJSON();
      return route.fulfill({ json: { status: true } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forgot your password?');
    await expect(page.getByText('reset-admin-password')).toBeVisible();
    await expectNoViolations(page);
    await saveScreenshot(page, 'forgot-password');

    await page.getByLabel('Email').fill('alex@example.com');
    await page.getByRole('button', { name: 'Email me a link' }).click();
    await expect(page.getByRole('status')).toContainText('If alex@example.com has an account');
    expect(asked).toEqual({ email: 'alex@example.com' });
    await expectNoViolations(page);

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  });

  test('isn’t offered when the server can’t send mail', async ({ page }) => {
    await noSession(page);
    await page.route('**/api/v1/sign-in-options', (route) =>
      route.fulfill({ json: { adminPasswordInConsole: false, passwordReset: false } }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot your password?' })).toHaveCount(0);
  });

  test('a reset link needs a password that meets the requirements', async ({ page }) => {
    await noSession(page);
    let sent: unknown = null;
    await page.route('**/api/v1/auth/reset-password', (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { status: true } });
    });
    await page.goto('/reset-password#token=abc123');
    await expect(page.getByRole('heading', { name: 'Choose a password', level: 1 })).toBeVisible();

    const field = page.getByLabel('New password');
    await field.fill('too short');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expectNoViolations(page);
    await saveScreenshot(page, 'reset-password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(field).toBeFocused();
    expect(sent).toBeNull();

    await field.fill('tulip-cactus-river');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    expect(sent).toEqual({ token: 'abc123', newPassword: 'tulip-cactus-river' });
  });

  test('says so when a link has expired', async ({ page }) => {
    await noSession(page);
    await page.route('**/api/v1/auth/reset-password', (route) =>
      route.fulfill({ status: 400, json: { code: 'INVALID_TOKEN', message: 'Invalid token' } }),
    );
    await page.goto('/reset-password#token=old');
    await page.getByLabel('New password').fill('tulip-cactus-river');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('alert')).toHaveText('This link has expired or was already used.');
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
    await expectNoViolations(page);
  });

  test('explains a link with no token', async ({ page }) => {
    await noSession(page);
    await page.goto('/reset-password');
    await expect(page.getByRole('alert')).toContainText('Open the link from your email again');
    await expectNoViolations(page);
  });
});

test('explains when the server cannot be reached at startup', async ({ page }) => {
  await page.route('**/api/v1/sign-in-options', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('can’t reach the server');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test.describe('server status', () => {
  test('stays hidden when everything is healthy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('warns when the database is down', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 503, json: { status: 'degraded', database: 'down' } }),
    );
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('database is unavailable');
    await expectNoViolations(page);
  });

  test('warns when the server cannot be reached', async ({ page }) => {
    await page.route('**/api/health', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('can’t reach the server');
  });
});

test('controls and links are large enough to tap', async ({ page }) => {
  await page.goto('/settings');
  const nav = visibleNav(page).getByRole('link');
  await expect(nav).toHaveCount(2);
  for (let i = 0; i < (await nav.count()); i += 1) {
    expect((await nav.nth(i).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  const option = page.locator('fieldset label').first();
  expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('no page scrolls sideways', async ({ page }) => {
  for (const path of ['/', '/settings', '/does-not-exist']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  }
});
