import { activityLog, category, space } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../core/app.ts';
import type { Authorize } from '../../core/feature.ts';
import { categories } from './index.ts';

// Who may call these routes is covered by permissions.test.ts, against real sign-in. Here a
// manager is always calling, so the tests are about what the routes do.
const PUBLIC_URL = 'https://remidy.test';
const ACTOR = 'user-1';
const STARTERS = [
  'Healthcare',
  'Housing',
  'Insurance',
  'Loans',
  'Other',
  'Phone and internet',
  'Subscriptions',
  'Transportation',
  'Utilities',
];

let test: TestDatabase;
let app: FastifyInstance;
let spaceId: string;
let otherSpaceId: string;

const authorize: Authorize = (_access, request) =>
  Promise.resolve({
    user: { userId: ACTOR, email: 'a@example.com', name: 'A', isInstanceAdmin: false },
    space: { id: (request.params as { spaceId: string }).spaceId, role: 'manager' },
  });

interface Category {
  id: string;
  name: string;
  archived: boolean;
}

const request = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path = '', payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/spaces/${spaceId}/categories${path}`,
    headers: { origin: PUBLIC_URL },
    ...(payload ? { payload } : {}),
  });
const list = async () => (await request('GET')).json<Category[]>();
const create = (name: string) => request('POST', '', { name });
const update = (id: string, changes: object) => request('PATCH', `/${id}`, changes);
const history = (entityId: string) =>
  test.database.orm
    .select({ action: activityLog.action, before: activityLog.before, after: activityLog.after })
    .from(activityLog)
    .where(and(eq(activityLog.entityId, entityId), eq(activityLog.actorId, ACTOR)))
    .orderBy(activityLog.id);

async function newSpace(name: string): Promise<string> {
  const [created] = await test.database.orm
    .insert(space)
    .values({ name, kind: 'shared' })
    .returning({ id: space.id });
  return created?.id ?? '';
}

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  app = buildApp({
    database: test.database,
    features: [categories],
    enabledFeatures: ['categories'],
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
  await test.database.orm.execute(sql`truncate activity_log, category, space cascade`);
  spaceId = await newSpace('Household');
  otherSpaceId = await newSpace('Neighbors');
});

describe('a new space', () => {
  it('starts with the starter set, in name order', async () => {
    expect((await list()).map((item) => item.name)).toEqual(STARTERS);
    expect((await list()).every((item) => !item.archived)).toBe(true);
  });

  it('gets its own copies, so changing one space’s set leaves another’s alone', async () => {
    const [first] = await list();
    await update(first?.id ?? '', { name: 'Medical' });
    const others = await test.database.orm
      .select({ name: category.name })
      .from(category)
      .where(eq(category.spaceId, otherSpaceId));
    expect(others.map((item) => item.name)).toContain('Healthcare');
  });
});

describe('creating', () => {
  it('adds a category, trimmed, and records it', async () => {
    const response = await create('  Pets  ');
    expect(response.statusCode).toBe(201);
    const created = response.json<Category>();
    expect(created).toMatchObject({ name: 'Pets', archived: false });
    expect(await history(created.id)).toEqual([
      { action: 'created', before: null, after: { name: 'Pets' } },
    ]);
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['too long', 'x'.repeat(51)],
  ])('refuses a name that is %s', async (_case, name) => {
    const response = await create(name);
    expect(response.statusCode).toBe(422);
  });

  it('accepts a name of exactly 50 characters', async () => {
    expect((await create('x'.repeat(50))).statusCode).toBe(201);
  });

  it('refuses a duplicate in the same space, whatever its case, and records nothing', async () => {
    const response = await create('uTILITIES');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'duplicate', fields: [{ path: 'name' }] },
    });
    expect(await history(spaceId)).toEqual([]);
  });

  it('refuses a name already used by an archived category', async () => {
    const [first] = await list();
    await update(first?.id ?? '', { archived: true });
    expect((await create(first?.name ?? '')).statusCode).toBe(409);
  });

  it('allows a name another space already uses', async () => {
    const neighbors = spaceId;
    spaceId = otherSpaceId;
    await create('Garden');
    spaceId = neighbors;
    expect((await create('Garden')).statusCode).toBe(201);
  });

  it('sorts without regard to case', async () => {
    await create('apples');
    await create('Zoo');
    const names = (await list()).map((item) => item.name);
    expect(names.indexOf('apples')).toBeLessThan(names.indexOf('Healthcare'));
    expect(names.at(-1)).toBe('Zoo');
  });
});

describe('renaming', () => {
  it('keeps the same id, so whatever uses it stays linked', async () => {
    const created = (await create('Pets')).json<Category>();
    const renamed = (await update(created.id, { name: 'Animals' })).json<Category>();
    expect(renamed).toEqual({ id: created.id, name: 'Animals', archived: false });
    expect((await history(created.id)).at(-1)).toEqual({
      action: 'updated',
      before: { name: 'Pets' },
      after: { name: 'Animals' },
    });
  });

  it('can change only the case of its own name', async () => {
    const created = (await create('Pets')).json<Category>();
    expect((await update(created.id, { name: 'PETS' })).statusCode).toBe(200);
  });

  it('refuses another category’s name, and changes nothing', async () => {
    const created = (await create('Pets')).json<Category>();
    expect((await update(created.id, { name: 'utilities' })).statusCode).toBe(409);
    expect((await list()).map((item) => item.name)).toContain('Pets');
    expect(await history(created.id)).toHaveLength(1);
  });

  it('records nothing when nothing changed', async () => {
    const created = (await create('Pets')).json<Category>();
    expect((await update(created.id, { name: 'Pets', archived: false })).statusCode).toBe(200);
    expect(await history(created.id)).toHaveLength(1);
  });
});

describe('archiving', () => {
  it('keeps an archived category, marked, and can restore it', async () => {
    const created = (await create('Pets')).json<Category>();
    expect((await update(created.id, { archived: true })).json<Category>().archived).toBe(true);
    expect((await list()).find((item) => item.id === created.id)?.archived).toBe(true);

    expect((await update(created.id, { archived: false })).json<Category>().archived).toBe(false);
    expect((await history(created.id)).slice(1)).toEqual([
      { action: 'updated', before: { archived: false }, after: { archived: true } },
      { action: 'updated', before: { archived: true }, after: { archived: false } },
    ]);
  });
});

describe('deleting', () => {
  it('removes it and records what it was', async () => {
    const created = (await create('Pets')).json<Category>();
    expect((await request('DELETE', `/${created.id}`)).statusCode).toBe(204);
    expect((await list()).map((item) => item.id)).not.toContain(created.id);
    expect((await history(created.id)).at(-1)).toEqual({
      action: 'deleted',
      before: { name: 'Pets', archived: false },
      after: null,
    });
  });

  it('frees the name for reuse', async () => {
    const created = (await create('Pets')).json<Category>();
    await request('DELETE', `/${created.id}`);
    expect((await create('Pets')).statusCode).toBe(201);
  });
});

describe('another space’s categories', () => {
  it('can’t be renamed, archived or deleted from this one', async () => {
    const [theirs] = await test.database.orm
      .select({ id: category.id })
      .from(category)
      .where(eq(category.spaceId, otherSpaceId))
      .limit(1);
    const id = theirs?.id ?? '';
    expect((await update(id, { name: 'Taken over' })).statusCode).toBe(404);
    expect((await update(id, { archived: true })).statusCode).toBe(404);
    expect((await request('DELETE', `/${id}`)).statusCode).toBe(404);

    const [still] = await test.database.orm
      .select({ name: category.name, archivedAt: category.archivedAt })
      .from(category)
      .where(eq(category.id, id));
    expect(still?.archivedAt).toBeNull();
    expect(still?.name).not.toBe('Taken over');
  });

  it('aren’t listed in this one', async () => {
    spaceId = otherSpaceId;
    await create('Their secret');
    spaceId = await newSpace('Mine');
    expect((await list()).map((item) => item.name)).not.toContain('Their secret');
  });
});

describe('a category that doesn’t exist', () => {
  it('answers not found', async () => {
    const missing = '0190a000-0000-7000-8000-000000000000';
    expect((await update(missing, { name: 'X' })).statusCode).toBe(404);
    expect((await request('DELETE', `/${missing}`)).statusCode).toBe(404);
  });
});
