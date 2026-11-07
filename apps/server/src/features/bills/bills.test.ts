import { activityLog, billOccurrence, category, membership, space, user } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import {
  addDays,
  addMonthsFromAnchor,
  dateFromParts,
  datePartsOf,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../core/app.ts';
import { AppError } from '../../core/errors.ts';
import type { Authorize } from '../../core/feature.ts';
import { findMembership, roleAtLeast } from '../../core/spaces.ts';
import { categories } from '../categories/index.ts';
import { bills } from './index.ts';
import { extendDueDates } from './repo.ts';

// Sign-in is covered elsewhere. Here a header says who's calling, and roles come from the real
// memberships, so these tests are about what the routes do and who sees what.
const PUBLIC_URL = 'https://remidy.test';

let test: TestDatabase;
let app: FastifyInstance;
const ids = { alice: '', bob: '', carol: '', alicePersonal: '', bobPersonal: '', household: '' };

const authorize: Authorize = async (access, request) => {
  const userId = String(request.headers['x-test-user']);
  const principal = {
    userId,
    email: `${userId}@example.com`,
    name: userId,
    isInstanceAdmin: false,
  };
  if (typeof access !== 'object') return { user: principal, space: null };
  const spaceId = (request.params as { spaceId: string }).spaceId;
  const role = await findMembership(test.database.orm, userId, spaceId);
  if (!role) throw new AppError(404, 'not_found', 'That wasn’t found.');
  if (!roleAtLeast(role, access.space)) throw new AppError(403, 'forbidden', 'Not allowed.');
  return { user: principal, space: { id: spaceId, role } };
};

const call = (
  who: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url,
    headers: { origin: PUBLIC_URL, 'x-test-user': who },
    ...(payload ? { payload } : {}),
  });

interface Bill {
  id: string;
  name: string;
  shared: boolean;
  categoryId: string | null;
  categoryName: string | null;
  archived: boolean;
}
interface Entry {
  billId: string;
  name: string;
  dueOn: string;
}

const now = () => today('UTC');
const monthStart = (date: CalendarDate) => {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
};

async function categoryIn(spaceId: string, name = 'Utilities') {
  const [row] = await test.database.orm
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.spaceId, spaceId), eq(category.name, name)));
  return row?.id ?? '';
}

const monthly = (firstDue: string) => ({
  kind: 'repeat' as const,
  unit: 'month' as const,
  every: 1,
  firstDue,
  lastDue: null,
});

const newBill = (overrides: object = {}) => ({
  name: 'Water',
  expectedCents: 4500,
  isVariable: false,
  schedule: monthly(now()),
  categoryId: null,
  autopay: false,
  url: null,
  notes: null,
  ...overrides,
});

async function create(who: string, spaceId: string, overrides: object = {}) {
  const response = await call(who, 'POST', `/api/v1/spaces/${spaceId}/bills`, newBill(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Bill>();
}

const occurrencesOf = (billId: string) =>
  test.database.orm
    .select({ dueOn: billOccurrence.dueOn, name: billOccurrence.billName })
    .from(billOccurrence)
    .where(eq(billOccurrence.billId, billId))
    .orderBy(asc(billOccurrence.dueOn));

/** A due date from before today, added directly, so these tests don't depend on today's date. */
async function addPastDueDate(created: Bill, dueOn: string, state: 'open' | 'settled' = 'open') {
  await test.database.orm.insert(billOccurrence).values({
    billId: created.id,
    spaceId: ids.alicePersonal,
    dueOn,
    billName: created.name,
    expectedCents: 4500,
    isVariable: false,
    state,
  });
}

const agendaFor = async (who: string, from: string, to: string) =>
  (await call(who, 'GET', `/api/v1/agenda?from=${from}&to=${to}`)).json<{
    overdue: Entry[];
    upcoming: Entry[];
  }>();

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  app = buildApp({
    database: test.database,
    features: [categories, bills],
    enabledFeatures: ['categories', 'bills'],
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
    sql`truncate activity_log, bill_occurrence, bill, category, membership, space, "user" cascade`,
  );
  for (const name of ['alice', 'bob', 'carol'] as const) {
    await orm.insert(user).values({ id: name, name, email: `${name}@example.com` });
    ids[name] = name;
  }
  const makeSpace = async (name: string, kind: 'personal' | 'shared') => {
    const [row] = await orm.insert(space).values({ name, kind }).returning({ id: space.id });
    return row?.id ?? '';
  };
  ids.alicePersonal = await makeSpace('Personal', 'personal');
  ids.bobPersonal = await makeSpace('Personal', 'personal');
  ids.household = await makeSpace('Household', 'shared');
  await orm.insert(membership).values([
    { userId: 'alice', spaceId: ids.alicePersonal, role: 'owner' },
    { userId: 'bob', spaceId: ids.bobPersonal, role: 'owner' },
    { userId: 'alice', spaceId: ids.household, role: 'owner' },
    { userId: 'bob', spaceId: ids.household, role: 'member' },
  ]);
});

describe('creating a bill', () => {
  it('adds due dates from this month to 13 months ahead, and records it', async () => {
    const day = Math.min(datePartsOf(now()).day, 28);
    const firstDue = addMonthsFromAnchor(dateFromParts(2020, 1, day) ?? now(), 0);
    const created = await create('alice', ids.alicePersonal, { schedule: monthly(firstDue) });

    const dates = (await occurrencesOf(created.id)).map((row) => row.dueOn);
    // A bill started years ago doesn't arrive with years of unpaid dates.
    expect(dates[0]?.slice(0, 7)).toBe(now().slice(0, 7));
    expect(dates).toHaveLength(14);
    expect(dates.at(-1)?.slice(0, 7)).toBe(addMonthsFromAnchor(monthStart(now()), 13).slice(0, 7));

    const [logged] = await test.database.orm
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, created.id));
    expect(logged).toMatchObject({
      action: 'created',
      actorId: 'alice',
      spaceId: ids.alicePersonal,
    });
    expect(logged?.after).toMatchObject({ name: 'Water' });
    expect(String(logged?.after?.schedule)).toMatch(/^Monthly/);
  });

  it('needs an amount unless the bill varies', async () => {
    const refused = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/bills`,
      newBill({ expectedCents: null }),
    );
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ error: { fields: [{ path: 'body.expectedCents' }] } });
    await create('alice', ids.alicePersonal, { expectedCents: null, isVariable: true });
  });

  it.each([
    ['a day that doesn’t exist', { schedule: monthly('2026-02-30') }, 'schedule.firstDue'],
    [
      'a last date before the first',
      { schedule: { ...monthly('2026-03-01'), lastDue: '2026-02-01' } },
      'schedule.lastDue',
    ],
    ['every 0 months', { schedule: { ...monthly('2026-03-01'), every: 0 } }, 'schedule.every'],
    ['an address that isn’t a web page', { url: 'javascript:alert(1)' }, 'url'],
  ])('refuses %s', async (_case, overrides, path) => {
    const response = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/bills`,
      newBill(overrides),
    );
    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(response.json())).toContain(path);
  });

  it('uses the household’s categories for personal bills too, once someone has a household', async () => {
    const householdCategory = await categoryIn(ids.household);
    const created = await create('alice', ids.alicePersonal, { categoryId: householdCategory });
    expect(created).toMatchObject({ shared: false, categoryName: 'Utilities' });

    const ownCategory = await categoryIn(ids.alicePersonal);
    const refused = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/bills`,
      newBill({ categoryId: ownCategory }),
    );
    expect(refused.statusCode).toBe(422);
  });

  it('refuses another space’s category, and the database refuses it too', async () => {
    const strangers = await categoryIn(ids.bobPersonal);
    const refused = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/bills`,
      newBill({ categoryId: strangers }),
    );
    expect(refused.statusCode).toBe(422);

    const created = await create('alice', ids.alicePersonal);
    await expect(
      test.database.orm.execute(
        sql`update bill set category_id = ${strangers} where id = ${created.id}`,
      ),
    ).rejects.toThrow();
  });

  it('refuses an archived category', async () => {
    const archived = await categoryIn(ids.household, 'Loans');
    await test.database.orm
      .update(category)
      .set({ archivedAt: sql`now()` })
      .where(eq(category.id, archived));
    const refused = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.household}/bills`,
      newBill({ categoryId: archived }),
    );
    expect(refused.statusCode).toBe(422);
  });

  it('can’t be done by a household member without the manager role', async () => {
    const refused = await call('bob', 'POST', `/api/v1/spaces/${ids.household}/bills`, newBill());
    expect(refused.statusCode).toBe(403);
  });
});

describe('who sees which bills', () => {
  it('shows each person their own bills and their household’s, never another’s personal ones', async () => {
    await create('alice', ids.alicePersonal, { name: 'Alice’s gym' });
    await create('alice', ids.household, { name: 'Rent' });
    await create('bob', ids.bobPersonal, { name: 'Bob’s phone' });

    const names = async (who: string) =>
      (await call(who, 'GET', '/api/v1/bills'))
        .json<Bill[]>()
        .map((item) => `${item.name}${item.shared ? ' (shared)' : ''}`);
    expect(await names('alice')).toEqual(['Alice’s gym', 'Rent (shared)']);
    expect(await names('bob')).toEqual(['Bob’s phone', 'Rent (shared)']);
    expect(await names('carol')).toEqual([]);

    const agendaNames = async (who: string) =>
      [
        ...new Set(
          (await agendaFor(who, now(), addDays(now(), 60))).upcoming.map((entry) => entry.name),
        ),
      ].sort();
    expect(await agendaNames('alice')).toEqual(['Alice’s gym', 'Rent']);
    expect(await agendaNames('bob')).toEqual(['Bob’s phone', 'Rent']);
    expect(await agendaNames('carol')).toEqual([]);
  });

  it('can’t reach a bill through another of the person’s spaces', async () => {
    const alices = await create('alice', ids.alicePersonal);
    const viaHousehold = `/api/v1/spaces/${ids.household}/bills/${alices.id}`;
    expect((await call('alice', 'PATCH', viaHousehold, { name: 'Moved' })).statusCode).toBe(404);
    expect((await call('alice', 'DELETE', viaHousehold)).statusCode).toBe(404);

    const bills = (await call('alice', 'GET', '/api/v1/bills')).json<Bill[]>();
    expect(bills.map((item) => item.name)).toEqual(['Water']);
    const logged = await test.database.orm
      .select({ action: activityLog.action })
      .from(activityLog)
      .where(eq(activityLog.entityId, alices.id));
    expect(logged.map((row) => row.action)).toEqual(['created']);
  });

  it('can’t change or delete another person’s personal bill, even by its id', async () => {
    const alices = await create('alice', ids.alicePersonal);
    const bobsUrl = `/api/v1/spaces/${ids.bobPersonal}/bills/${alices.id}`;
    expect((await call('bob', 'PATCH', bobsUrl, { name: 'Taken' })).statusCode).toBe(404);
    expect((await call('bob', 'DELETE', bobsUrl)).statusCode).toBe(404);
    const alicesUrl = `/api/v1/spaces/${ids.alicePersonal}/bills/${alices.id}`;
    expect((await call('bob', 'PATCH', alicesUrl, { name: 'Taken' })).statusCode).toBe(404);
    expect((await occurrencesOf(alices.id))[0]?.name).toBe('Water');
  });
});

describe('the agenda', () => {
  it('lists open due dates before today as overdue, whatever range is asked for', async () => {
    const created = await create('alice', ids.alicePersonal, {
      name: 'Late',
      schedule: { kind: 'once', firstDue: addDays(now(), 365) },
    });
    await addPastDueDate(created, '2020-01-15');
    await addPastDueDate(created, '2020-02-15', 'settled');
    const { overdue, upcoming } = await agendaFor('alice', addDays(now(), 30), addDays(now(), 60));
    // The settled one isn't overdue: only open ones are.
    expect(overdue.map((entry) => entry.dueOn)).toEqual(['2020-01-15']);
    expect(upcoming).toEqual([]);
  });

  it.each([
    ['a range that ends before it starts', '2026-02-01', '2026-01-01'],
    ['a range over 400 days', '2026-01-01', '2027-03-01'],
    ['a day that doesn’t exist', '2026-02-30', '2026-03-01'],
  ])('refuses %s', async (_case, from, to) => {
    expect((await call('alice', 'GET', `/api/v1/agenda?from=${from}&to=${to}`)).statusCode).toBe(
      422,
    );
  });
});

describe('editing a bill', () => {
  it('changes only due dates from today on, keeping the past as it was', async () => {
    const start = monthStart(now());
    const created = await create('alice', ids.alicePersonal, { schedule: monthly(start) });
    await addPastDueDate(created, '2020-01-15');
    const pastBefore = (await occurrencesOf(created.id)).filter((row) => row.dueOn < now());
    const response = await call(
      'alice',
      'PATCH',
      `/api/v1/spaces/${ids.alicePersonal}/bills/${created.id}`,
      { name: 'Water and sewer' },
    );
    expect(response.json<Bill>().name).toBe('Water and sewer');

    const rows = await occurrencesOf(created.id);
    for (const row of rows) {
      expect(row.name).toBe(row.dueOn < now() ? 'Water' : 'Water and sewer');
    }
    // Still there, not deleted and replaced.
    expect(rows.filter((row) => row.dueOn < now())).toEqual(pastBefore);
  });

  it('records only what changed, and nothing when nothing did', async () => {
    const created = await create('alice', ids.alicePersonal);
    const url = `/api/v1/spaces/${ids.alicePersonal}/bills/${created.id}`;
    await call('alice', 'PATCH', url, { name: 'Water' });
    await call('alice', 'PATCH', url, { expectedCents: 5000, notes: 'Meter 12' });
    const logged = await test.database.orm
      .select({ action: activityLog.action, before: activityLog.before, after: activityLog.after })
      .from(activityLog)
      .where(eq(activityLog.entityId, created.id))
      .orderBy(asc(activityLog.id));
    expect(logged).toEqual([
      expect.objectContaining({ action: 'created' }),
      {
        action: 'updated',
        before: { expectedCents: 4500, notes: 'changed' },
        after: { expectedCents: 5000, notes: 'changed' },
      },
    ]);
  });

  it('stops new due dates when archived, and brings them back when restored', async () => {
    const created = await create('alice', ids.alicePersonal, {
      schedule: monthly(addDays(now(), 1)),
    });
    const url = `/api/v1/spaces/${ids.alicePersonal}/bills/${created.id}`;
    expect((await call('alice', 'PATCH', url, { archived: true })).json<Bill>().archived).toBe(
      true,
    );
    expect(await occurrencesOf(created.id)).toEqual([]);
    await extendDueDates(test.database.orm);
    expect(await occurrencesOf(created.id)).toEqual([]);

    await call('alice', 'PATCH', url, { archived: false });
    expect((await occurrencesOf(created.id)).length).toBe(13);
  });

  it('refuses to drop the amount from a bill that doesn’t vary', async () => {
    const created = await create('alice', ids.alicePersonal);
    const url = `/api/v1/spaces/${ids.alicePersonal}/bills/${created.id}`;
    expect((await call('alice', 'PATCH', url, { expectedCents: null })).statusCode).toBe(422);
  });
});

describe('deleting', () => {
  it('removes a bill and its due dates, and records what it was', async () => {
    const created = await create('alice', ids.alicePersonal);
    const response = await call(
      'alice',
      'DELETE',
      `/api/v1/spaces/${ids.alicePersonal}/bills/${created.id}`,
    );
    expect(response.statusCode).toBe(204);
    expect(await occurrencesOf(created.id)).toEqual([]);
    const [logged] = await test.database.orm
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, created.id), eq(activityLog.action, 'deleted')));
    expect(logged?.before).toMatchObject({ name: 'Water' });
  });

  it('refuses to delete a category bills use, so their history keeps it', async () => {
    const householdCategory = await categoryIn(ids.household);
    await create('alice', ids.household, { categoryId: householdCategory });
    const response = await call(
      'alice',
      'DELETE',
      `/api/v1/spaces/${ids.household}/categories/${householdCategory}`,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'in_use' } });
  });
});

describe('the due date job', () => {
  it('is safe to run any number of times', async () => {
    const created = await create('alice', ids.alicePersonal);
    const before = await occurrencesOf(created.id);
    await extendDueDates(test.database.orm);
    await extendDueDates(test.database.orm);
    expect(await occurrencesOf(created.id)).toEqual(before);
  });

  it('fills in due dates that are missing', async () => {
    const created = await create('alice', ids.alicePersonal);
    await test.database.orm
      .delete(billOccurrence)
      .where(
        and(
          eq(billOccurrence.billId, created.id),
          sql`${billOccurrence.dueOn} > ${addDays(now(), 40)}`,
        ),
      );
    await extendDueDates(test.database.orm);
    expect((await occurrencesOf(created.id)).length).toBe(14);
  });
});
