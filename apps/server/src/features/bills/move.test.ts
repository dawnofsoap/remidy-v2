import { activityLog, bill, billOccurrence, category } from '@remidy/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  addPastDueDate,
  call,
  categoryIn,
  create,
  ids,
  now,
  test,
  useBillsHarness,
  type Bill,
} from './testing.ts';

useBillsHarness();

const move = (who: string, fromSpaceId: string, billId: string, toSpaceId: string) =>
  call(who, 'POST', `/api/v1/spaces/${fromSpaceId}/bills/${billId}/move`, { toSpaceId });

const namesFor = async (who: string) =>
  (await call(who, 'GET', '/api/v1/bills')).json<Bill[]>().map((item) => item.name);

const occurrenceSpaces = async (billId: string) => [
  ...new Set(
    (
      await test.database.orm
        .select({ spaceId: billOccurrence.spaceId })
        .from(billOccurrence)
        .where(eq(billOccurrence.billId, billId))
    ).map((row) => row.spaceId),
  ),
];

describe('moving a bill', () => {
  it('shares a personal bill with the household, history and all', async () => {
    const created = await create('alice', ids.alicePersonal, { name: 'Internet' });
    await addPastDueDate(created, '2020-01-15');
    expect(await namesFor('bob')).toEqual([]);

    const response = await move('alice', ids.alicePersonal, created.id, ids.household);
    expect(response.statusCode).toBe(200);
    expect(response.json<Bill>()).toMatchObject({ shared: true, spaceId: ids.household });
    expect(await namesFor('bob')).toEqual(['Internet']);
    expect(await occurrenceSpaces(created.id)).toEqual([ids.household]);
  });

  it('takes a shared bill back to personal, hiding it and its history from everyone else', async () => {
    const created = await create('alice', ids.household, { name: 'Gym' });
    expect(await namesFor('bob')).toEqual(['Gym']);

    await move('alice', ids.household, created.id, ids.alicePersonal);
    expect(await namesFor('bob')).toEqual([]);
    expect(await namesFor('alice')).toEqual(['Gym']);
    expect(await occurrenceSpaces(created.id)).toEqual([ids.alicePersonal]);
  });

  it('swaps a category the household can’t use for its own one with the same name', async () => {
    // Made before Alice joined a household, so it uses one of her own categories.
    const created = await create('alice', ids.alicePersonal);
    const own = await categoryIn(ids.alicePersonal, 'Utilities');
    await test.database.orm.update(bill).set({ categoryId: own }).where(eq(bill.id, created.id));

    const moved = (await move('alice', ids.alicePersonal, created.id, ids.household)).json<Bill>();
    expect(moved.categoryId).toBe(await categoryIn(ids.household, 'Utilities'));
    expect(moved.categoryName).toBe('Utilities');
    // Due dates from today on use it too.
    const future = await test.database.orm
      .select({ categoryId: billOccurrence.categoryId })
      .from(billOccurrence)
      .where(and(eq(billOccurrence.billId, created.id), gte(billOccurrence.dueOn, now())));
    expect(future.length).toBeGreaterThan(0);
    expect(new Set(future.map((row) => row.categoryId))).toEqual(new Set([moved.categoryId]));
  });

  it('clears a category the household has nothing like', async () => {
    const created = await create('alice', ids.alicePersonal);
    const own = await categoryIn(ids.alicePersonal, 'Loans');
    await test.database.orm.update(bill).set({ categoryId: own }).where(eq(bill.id, created.id));
    await test.database.orm
      .update(category)
      .set({ name: 'Old loans' })
      .where(and(eq(category.spaceId, ids.household), eq(category.name, 'Loans')));

    const moved = (await move('alice', ids.alicePersonal, created.id, ids.household)).json<Bill>();
    expect(moved.categoryId).toBeNull();
  });

  it('doesn’t swap in an archived category', async () => {
    const created = await create('alice', ids.alicePersonal);
    const own = await categoryIn(ids.alicePersonal, 'Loans');
    await test.database.orm.update(bill).set({ categoryId: own }).where(eq(bill.id, created.id));
    await test.database.orm
      .update(category)
      .set({ archivedAt: sql`now()` })
      .where(and(eq(category.spaceId, ids.household), eq(category.name, 'Loans')));

    const moved = (await move('alice', ids.alicePersonal, created.id, ids.household)).json<Bill>();
    expect(moved.categoryId).toBeNull();
  });

  it('records the move in both spaces', async () => {
    const created = await create('alice', ids.alicePersonal);
    await move('alice', ids.alicePersonal, created.id, ids.household);
    const logged = await test.database.orm
      .select({ spaceId: activityLog.spaceId, action: activityLog.action })
      .from(activityLog)
      .where(and(eq(activityLog.entityId, created.id), sql`${activityLog.action} like 'moved%'`));
    expect(logged).toEqual(
      expect.arrayContaining([
        { spaceId: ids.alicePersonal, action: 'moved out' },
        { spaceId: ids.household, action: 'moved in' },
      ]),
    );
  });

  it('can’t be done by a household member without the manager role', async () => {
    const created = await create('alice', ids.household);
    expect((await move('bob', ids.household, created.id, ids.bobPersonal)).statusCode).toBe(403);
  });

  it('can’t put a bill where the person couldn’t add one', async () => {
    const created = await create('bob', ids.bobPersonal);
    // Bob is only a member of the household, so he can't add bills to it.
    const refused = await move('bob', ids.bobPersonal, created.id, ids.household);
    expect(refused.statusCode).toBe(422);
    // Nor into someone else's space, which reads the same as one that doesn't exist.
    const strangers = await move('bob', ids.bobPersonal, created.id, ids.alicePersonal);
    expect(strangers.statusCode).toBe(422);
    expect(await namesFor('bob')).toEqual(['Water']);
  });

  it('refuses a move to where it already is, or of a bill from another space', async () => {
    const created = await create('alice', ids.alicePersonal);
    expect((await move('alice', ids.alicePersonal, created.id, ids.alicePersonal)).statusCode).toBe(
      422,
    );
    expect((await move('alice', ids.household, created.id, ids.alicePersonal)).statusCode).toBe(
      404,
    );
  });
});
