import { billOccurrence, category, membership, space, user } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { dateFromParts, datePartsOf, today, type CalendarDate } from '@remidy/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { buildApp } from '../../core/app.ts';
import { AppError } from '../../core/errors.ts';
import type { Authorize } from '../../core/feature.ts';
import { findMembership, roleAtLeast } from '../../core/spaces.ts';
import { categories } from '../categories/index.ts';
import { logos } from '../logos/index.ts';
import { bills } from './index.ts';

// Shared by the bills tests. Sign-in is covered elsewhere: here a header says who's calling, and
// roles come from the real memberships, so the tests are about what the routes do and who sees what.
export const PUBLIC_URL = 'https://remidy.test';

export let test: TestDatabase;
export let app: FastifyInstance;
export const ids = {
  alice: '',
  bob: '',
  carol: '',
  alicePersonal: '',
  bobPersonal: '',
  household: '',
};

export const authorize: Authorize = async (access, request) => {
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

export const call = (
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

export interface Bill {
  id: string;
  name: string;
  shared: boolean;
  categoryId: string | null;
  categoryName: string | null;
  archived: boolean;
}
export interface Entry {
  billId: string;
  name: string;
  dueOn: string;
}

export const now = () => today('UTC');
export const monthStart = (date: CalendarDate) => {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
};

export async function categoryIn(spaceId: string, name = 'Utilities') {
  const [row] = await test.database.orm
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.spaceId, spaceId), eq(category.name, name)));
  return row?.id ?? '';
}

export const monthly = (firstDue: string) => ({
  kind: 'repeat' as const,
  unit: 'month' as const,
  every: 1,
  firstDue,
  lastDue: null,
});

export const newBill = (overrides: object = {}) => ({
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

export async function create(who: string, spaceId: string, overrides: object = {}) {
  const response = await call(who, 'POST', `/api/v1/spaces/${spaceId}/bills`, newBill(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<Bill>();
}

export const occurrencesOf = (billId: string) =>
  test.database.orm
    .select({ dueOn: billOccurrence.dueOn, name: billOccurrence.billName })
    .from(billOccurrence)
    .where(eq(billOccurrence.billId, billId))
    .orderBy(asc(billOccurrence.dueOn));

/** A due date from before today, added directly, so these tests don't depend on today's date. */
export async function addPastDueDate(
  created: Bill,
  dueOn: string,
  state: 'open' | 'settled' = 'open',
) {
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

export const agendaFor = async (who: string, from: string, to: string) =>
  (await call(who, 'GET', `/api/v1/agenda?from=${from}&to=${to}`)).json<{
    overdue: Entry[];
    upcoming: Entry[];
  }>();

/** A real database and app, with three people, two personal spaces and a household, made fresh before each test. */
export function useBillsHarness() {
  beforeAll(async () => {
    test = await startTestDatabase();
    await test.database.migrate();
    app = buildApp({
      database: test.database,
      features: [categories, logos, bills],
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
      sql`truncate activity_log, bill_occurrence, bill, logo, category, membership, space, "user" cascade`,
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
}
