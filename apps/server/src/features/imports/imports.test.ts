import type { ImportPreviewResponse } from '@remidy/contracts';
import {
  activityLog,
  bill,
  billOccurrence,
  category,
  logo,
  membership,
  space,
  user,
} from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { addDays, today } from '@remidy/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../core/app.ts';
import type { Authorize } from '../../core/feature.ts';
import { bills } from '../bills/index.ts';
import { categories } from '../categories/index.ts';
import { logos } from '../logos/index.ts';
import { imports } from './index.ts';

// Who may call these routes is covered by permissions.test.ts. Here a header says who's calling,
// and roles come from real memberships, so the tests are about what the import does.
const PUBLIC_URL = 'https://remidy.test';
let test: TestDatabase;
let app: FastifyInstance;
const ids = { alicePersonal: '', bobPersonal: '', carolPersonal: '', household: '' };

const authorize: Authorize = (_access, request) => {
  const userId = String(request.headers['x-test-user']);
  return Promise.resolve({
    user: { userId, email: `${userId}@example.com`, name: userId, isInstanceAdmin: false },
    space: null,
  });
};

const post = (who: string, url: string, payload: object) =>
  app.inject({
    method: 'POST',
    url,
    headers: { origin: PUBLIC_URL, 'x-test-user': who },
    payload,
  });

const now = () => today('UTC');
// The smallest PNG v2 keeps: its signature, then enough to be a file.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

// Made up, in the shape of v1's export, with v1's column names.
const v1Bill = (overrides: Record<string, unknown> = {}) => ({
  bill_name: 'Water',
  amount: '45.00',
  is_variable_amount: false,
  billing_frequency: 'monthly',
  due_day: 1,
  start_date: '2026-01-01',
  end_date: null,
  category: 'Utilities',
  auto_pay: false,
  is_active: true,
  url: 'https://example.com/water',
  notes: null,
  icon_url: null,
  ownership: 'household',
  ...overrides,
});
const exportOf = (v1Bills: unknown[], v1Categories: string[] = []) => ({
  exportDate: '2026-03-10T15:04:05.000Z',
  exportVersion: '1.0',
  bills: v1Bills,
  payments: [],
  paymentAccounts: [],
  categories: v1Categories.map((name) => ({ name })),
});

async function preview(who: string, file: unknown) {
  const response = await post(who, '/api/v1/imports/preview', { file });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ImportPreviewResponse>();
}

const billsIn = (spaceId: string) =>
  test.database.orm
    .select({
      id: bill.id,
      name: bill.name,
      categoryId: bill.categoryId,
      logoId: bill.logoId,
      archivedAt: bill.archivedAt,
    })
    .from(bill)
    .where(eq(bill.spaceId, spaceId))
    .orderBy(asc(bill.name));

const dueDatesOf = async (billId: string) =>
  (
    await test.database.orm
      .select({ dueOn: billOccurrence.dueOn })
      .from(billOccurrence)
      .where(eq(billOccurrence.billId, billId))
      .orderBy(asc(billOccurrence.dueOn))
  ).map((row) => row.dueOn);

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  app = buildApp({
    database: test.database,
    features: [categories, logos, bills, imports],
    enabledFeatures: ['categories', 'bills', 'imports'],
    authorize,
    publicUrl: PUBLIC_URL,
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await test.stop();
});

beforeEach(async () => {
  const { orm } = test.database;
  await orm.execute(
    sql`truncate activity_log, bill_occurrence, bill, logo, category, membership, space, "user" cascade`,
  );
  for (const name of ['alice', 'bob', 'carol']) {
    await orm.insert(user).values({ id: name, name, email: `${name}@example.com` });
  }
  const makeSpace = async (name: string, kind: 'personal' | 'shared') => {
    const [row] = await orm.insert(space).values({ name, kind }).returning({ id: space.id });
    return row?.id ?? '';
  };
  ids.alicePersonal = await makeSpace('Personal', 'personal');
  ids.bobPersonal = await makeSpace('Personal', 'personal');
  ids.carolPersonal = await makeSpace('Personal', 'personal');
  ids.household = await makeSpace('Household', 'shared');
  await orm.insert(membership).values([
    { userId: 'alice', spaceId: ids.alicePersonal, role: 'owner' },
    { userId: 'bob', spaceId: ids.bobPersonal, role: 'owner' },
    { userId: 'carol', spaceId: ids.carolPersonal, role: 'owner' },
    { userId: 'alice', spaceId: ids.household, role: 'owner' },
    { userId: 'bob', spaceId: ids.household, role: 'member' },
  ]);
});

describe('previewing a v1 import', () => {
  it('lists what would be created, and saves nothing', async () => {
    const result = await preview(
      'alice',
      exportOf(
        [v1Bill(), v1Bill({ bill_name: 'Gym', ownership: 'personal', category: 'Fitness' })],
        ['Housing'],
      ),
    );
    expect(result.hasHousehold).toBe(true);
    expect(result.bills).toEqual([
      expect.objectContaining({
        index: 0,
        name: 'Water',
        expectedCents: 4500,
        scheduleText: expect.stringMatching(/month/i) as unknown,
        categoryName: 'Utilities',
        shared: true,
        status: 'ready',
        checks: [],
      }),
      expect.objectContaining({ index: 1, name: 'Gym', shared: false, status: 'ready' }),
    ]);
    // The next due date is on or after today, on v1's schedule.
    expect(result.bills[0]?.nextDue && result.bills[0].nextDue >= now()).toBe(true);
    // The household's starter categories include Utilities and Housing, but not Fitness.
    expect(result.categories).toEqual([
      { name: 'Fitness', exists: false },
      { name: 'Housing', exists: true },
      { name: 'Utilities', exists: true },
    ]);
    expect(await billsIn(ids.household)).toEqual([]);
    expect(await billsIn(ids.alicePersonal)).toEqual([]);
  });

  it('marks likely duplicates, finished and stopped bills, which aren’t ready to import', async () => {
    await post('alice', '/api/v1/imports', {
      file: exportOf([v1Bill()]),
      bills: [{ index: 0, shared: true }],
    });
    const result = await preview(
      'alice',
      exportOf([
        v1Bill({ bill_name: ' water ' }),
        v1Bill({ bill_name: 'Old loan', end_date: '2026-02-01' }),
        v1Bill({ bill_name: 'Once', billing_frequency: 'one-time', start_date: '2026-01-05' }),
        v1Bill({ bill_name: 'Stopped', is_active: false }),
      ]),
    );
    expect(result.bills.map((item) => [item.name, item.status, item.nextDue === null])).toEqual([
      ['water', 'duplicate', false],
      ['Old loan', 'finished', true],
      ['Once', 'finished', true],
      ['Stopped', 'archived', false],
    ]);
  });

  it('leaves off a website v2 can’t use, and skips a bill v2’s rules refuse, saying why', async () => {
    const result = await preview(
      'alice',
      exportOf([
        v1Bill({ url: 'www.example.com' }),
        v1Bill({ bill_name: 'x'.repeat(300) }),
        v1Bill({ bill_name: 'Twice a month', billing_frequency: 'semimonthly' }),
      ]),
    );
    expect(result.bills).toHaveLength(1);
    expect(result.bills[0]?.checks).toEqual([
      'Its website, “www.example.com”, isn’t a web address v2 can use, so it’s left off.',
    ]);
    expect(result.skipped.map((item) => item.reason)).toEqual([
      expect.stringMatching(/semimonthly/) as unknown,
      expect.stringMatching(
        /^It can’t be added as it is: Use \d+ characters or fewer\.$/,
      ) as unknown,
    ]);
  });

  it('puts everything in the person’s own space when they have no household', async () => {
    const result = await preview('carol', exportOf([v1Bill()]));
    expect(result.hasHousehold).toBe(false);
    expect(result.bills[0]?.shared).toBe(false);
  });

  it.each([null, { bills: [] }, 'text'])('refuses %j, which isn’t a v1 export', async (file) => {
    const response = await post('alice', '/api/v1/imports/preview', { file });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { fields: { path: string }[] } }>().error.fields[0]?.path).toBe(
      'file',
    );
  });
});

describe('importing from v1', () => {
  it('creates the chosen bills where they were chosen to go, with categories and logos', async () => {
    const file = exportOf(
      [
        v1Bill({ icon_url: `data:image/png;base64,${PNG.toString('base64')}` }),
        v1Bill({ bill_name: 'Gym', ownership: 'personal', category: 'Fitness' }),
        v1Bill({ bill_name: 'Left out' }),
      ],
      ['Pets'],
    );
    const response = await post('alice', '/api/v1/imports', {
      file,
      bills: [
        { index: 0, shared: true },
        { index: 1, shared: false },
      ],
    });
    expect(response.statusCode, response.body).toBe(201);
    // Fitness and Pets are new. Utilities is one of the starter categories.
    expect(response.json()).toEqual({ billCount: 2, categoryCount: 2 });

    const [water] = await billsIn(ids.household);
    const [gym] = await billsIn(ids.alicePersonal);
    expect(water?.name).toBe('Water');
    expect(gym?.name).toBe('Gym');
    expect(await billsIn(ids.household)).toHaveLength(1);

    const categoryName = async (categoryId: string | null | undefined) =>
      (
        await test.database.orm
          .select({ name: category.name, spaceId: category.spaceId })
          .from(category)
          .where(eq(category.id, categoryId ?? '00000000-0000-0000-0000-000000000000'))
      )[0];
    // Categories live in the household, where Alice's lists are.
    expect(await categoryName(water?.categoryId)).toEqual({
      name: 'Utilities',
      spaceId: ids.household,
    });
    expect(await categoryName(gym?.categoryId)).toEqual({
      name: 'Fitness',
      spaceId: ids.household,
    });

    const [stored] = await test.database.orm.select({ id: logo.id }).from(logo);
    expect(water?.logoId).toBe(stored?.id);
    expect(gym?.logoId).toBeNull();

    const created = await test.database.orm
      .select({ entity: activityLog.entity })
      .from(activityLog)
      .where(and(eq(activityLog.action, 'created'), eq(activityLog.entity, 'bill')));
    expect(created).toHaveLength(2);
  });

  it('starts due dates today, since earlier ones were paid in v1', async () => {
    await post('alice', '/api/v1/imports', {
      file: exportOf([v1Bill({ billing_frequency: 'weekly', start_date: '2026-01-01' })]),
      bills: [{ index: 0, shared: true }],
    });
    const [water] = await billsIn(ids.household);
    const dates = await dueDatesOf(water?.id ?? '');
    expect(dates.length).toBeGreaterThan(0);
    expect(dates[0]).toBeDefined();
    expect((dates[0] ?? '') >= now()).toBe(true);
    expect((dates[0] ?? '') <= addDays(now(), 6)).toBe(true);
  });

  it('brings a stopped bill in archived, with no due dates', async () => {
    await post('alice', '/api/v1/imports', {
      file: exportOf([v1Bill({ is_active: false })]),
      bills: [{ index: 0, shared: false }],
    });
    const [water] = await billsIn(ids.alicePersonal);
    expect(water?.archivedAt).not.toBeNull();
    expect(await dueDatesOf(water?.id ?? '')).toEqual([]);
  });

  it('saves nothing when any bill can’t go where it was chosen to', async () => {
    // Bob is only a member of the household, so he can't add bills to it.
    const response = await post('bob', '/api/v1/imports', {
      file: exportOf([v1Bill({ bill_name: 'Mine' }), v1Bill()], ['Pets']),
      bills: [
        { index: 0, shared: false },
        { index: 1, shared: true },
      ],
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { message: string } }>().error.message).toMatch(/household/);
    expect(await billsIn(ids.bobPersonal)).toEqual([]);
    expect(await billsIn(ids.household)).toEqual([]);
  });

  it('adds no categories where the person can’t, and still imports their own bills', async () => {
    const response = await post('bob', '/api/v1/imports', {
      file: exportOf([v1Bill({ category: 'Fitness' })]),
      bills: [{ index: 0, shared: false }],
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ billCount: 1, categoryCount: 0 });
    expect((await billsIn(ids.bobPersonal))[0]?.categoryId).toBeNull();
  });

  it.each([
    ['a bill not in the file', [{ index: 5, shared: false }], /isn’t in the file/],
    [
      'the same bill twice',
      [
        { index: 0, shared: false },
        { index: 0, shared: false },
      ],
      /twice/,
    ],
    ['nothing', [], /at least one/],
  ])('refuses %s', async (_label, choices, message) => {
    const response = await post('alice', '/api/v1/imports', {
      file: exportOf([v1Bill()]),
      bills: choices,
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toMatch(message);
    expect(await billsIn(ids.alicePersonal)).toEqual([]);
  });
});
