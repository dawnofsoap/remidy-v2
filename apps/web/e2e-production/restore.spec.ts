import { expect, test, type Page } from '@playwright/test';
import { ADMIN_EMAIL, type JobStatusResponse, type SpaceResponse } from '@remidy/contracts';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compose, passwordIn, REPO_ROOT, STACK } from './stack.ts';

// Runs after image.spec.ts, on the same stack. Uses the real scripts, as an owner would.
const SAVED_PASSWORD = 'the passphrase in the backup';
const FOLDER = 'backups/e2e';
const FOLDER_ON_DISK = join(REPO_ROOT, FOLDER);

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const script = (command: string) =>
  execSync(`sh deploy/${command}`, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: 'pipe',
    env: { ...process.env, REMIDY_COMPOSE: STACK },
  });

/** Calls the API from inside the page, so it carries the session and origin a person's would. */
const api = <T>(page: Page, url: string, method = 'GET', body?: unknown) =>
  page.evaluate(
    async ([url, method, body]) => {
      const response = await fetch(url as string, {
        method: method as string,
        headers: { 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok)
        throw new Error(`${String(method)} ${String(url)}: ${String(response.status)}`);
      return (await response.json()) as unknown;
    },
    [url, method, body],
  ) as Promise<T>;

async function signIn(page: Page, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function spaceOf(page: Page): Promise<SpaceResponse> {
  const [space] = await api<SpaceResponse[]>(page, '/api/v1/spaces');
  if (!space) throw new Error('The admin has no space.');
  return space;
}
const setTimeZone = async (page: Page, timeZone: string) => {
  const { id } = await spaceOf(page);
  await api(page, `/api/v1/spaces/${id}`, 'PATCH', { timeZone });
};

async function expectWorkingApp(page: Page, since: number) {
  await expect
    .poll(async () => (await page.request.get('/api/health')).status(), { timeout: 60_000 })
    .toBe(200);
  await signIn(page, SAVED_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

  const space = await spaceOf(page);
  expect(space.timeZone).toBe('Asia/Tokyo');

  const { entries } = await api<{ entries: { after: unknown }[] }>(
    page,
    `/api/v1/spaces/${space.id}/activity`,
  );
  expect(entries.map((entry) => entry.after)).toContainEqual({ timeZone: 'Asia/Tokyo' });
  expect(entries.map((entry) => entry.after)).not.toContainEqual({ timeZone: 'Europe/Paris' });

  // History is still protected, and background jobs still run.
  expect(() =>
    compose('exec -T db psql -U remidy -d remidy -c "DELETE FROM activity_log"'),
  ).toThrow();
  await expect
    .poll(
      async () => {
        const jobs = await api<JobStatusResponse>(page, '/api/v1/admin/jobs');
        const heartbeat = jobs.find((job) => job.name === 'heartbeat');
        return Date.parse(heartbeat?.lastSucceededAt ?? '') || 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(since);
}

let backup = '';

test.beforeAll(() => {
  mkdirSync(FOLDER_ON_DISK, { recursive: true });
});
test.afterAll(() => {
  rmSync(FOLDER_ON_DISK, { recursive: true, force: true });
});

test('a backup saves a private file', async ({ page }) => {
  const temporary = passwordIn(
    compose('exec -T server node apps/server/src/core/auth/reset-admin-password.ts'),
  );
  await signIn(page, temporary ?? '');
  await page.getByLabel('Temporary password').fill(temporary ?? '');
  await page.getByLabel('New password').fill(SAVED_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await setTimeZone(page, 'Asia/Tokyo');

  backup = /Saved (\S+)/.exec(script(`backup.sh ${FOLDER}`))?.[1] ?? '';
  expect(backup).toMatch(/\.dump$/);
  const { size, mode } = statSync(join(REPO_ROOT, backup));
  expect(size).toBeGreaterThan(1000);
  // Windows has no owner-only setting to check.
  if (process.platform !== 'win32') expect(mode & 0o077).toBe(0);
});

test('a damaged backup changes nothing', async ({ page }) => {
  await signIn(page, SAVED_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await setTimeZone(page, 'Europe/Paris');

  const damaged = `${FOLDER}/damaged.dump`;
  const whole = readFileSync(join(REPO_ROOT, backup));
  writeFileSync(join(REPO_ROOT, damaged), whole.subarray(0, whole.length / 2));
  expect(() => script(`restore.sh ${damaged}`)).toThrow(/couldn.t be restored/);

  expect((await spaceOf(page)).timeZone).toBe('Europe/Paris');
  const databases = compose(
    'exec -T db psql -U remidy -d postgres -Atc "SELECT datname FROM pg_database"',
  );
  expect(databases).not.toContain('remidy_restoring');
});

test('asks for a file, rather than guessing', () => {
  expect(() => script('restore.sh')).toThrow(/Usage/);
  expect(() => script('restore.sh backups/e2e/nothing.dump')).toThrow(/Usage/);
});

test('a failed backup leaves nothing that looks like a backup', () => {
  const before = readdirSync(FOLDER_ON_DISK).sort();
  compose('stop db');
  try {
    expect(() => script(`backup.sh ${FOLDER}`)).toThrow();
    expect(readdirSync(FOLDER_ON_DISK).sort()).toEqual(before);
  } finally {
    compose('up --detach --wait --wait-timeout 120');
  }
});

test('a backup restores over newer data, keeping that data aside', async ({ page }) => {
  const since = Date.now();
  script(`restore.sh ${backup}`);
  await expectWorkingApp(page, since);
  const kept = compose(
    `exec -T db psql -U remidy -d remidy_before_restore -Atc "SELECT time_zone FROM space"`,
  );
  expect(kept).toContain('Europe/Paris');
});

test('a backup restores to a working app after everything is lost', async ({ page }) => {
  compose('down --volumes');
  compose('up --detach --wait --wait-timeout 120');
  const since = Date.now();
  script(`restore.sh ${backup}`);
  await expectWorkingApp(page, since);
});
