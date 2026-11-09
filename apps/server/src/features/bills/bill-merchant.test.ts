import { activityLog } from '@remidy/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { call, create, ids, occurrencesOf, test, useBillsHarness } from './testing.ts';

useBillsHarness();

const update = (billId: string, changes: object) =>
  call('alice', 'PATCH', `/api/v1/spaces/${ids.alicePersonal}/bills/${billId}`, changes);

describe('a bill’s merchant', () => {
  it('is saved apart from the name', async () => {
    const created = await create('alice', ids.alicePersonal, {
      name: 'Chase credit card',
      merchant: '  Chase ',
    });
    expect(created).toMatchObject({ name: 'Chase credit card', merchant: 'Chase' });
  });

  it('is optional, so older copies of the app keep working, and blank is none', async () => {
    expect(await create('alice', ids.alicePersonal)).toMatchObject({ merchant: null });
    expect(await create('alice', ids.alicePersonal, { merchant: '   ' })).toMatchObject({
      merchant: null,
    });
  });

  it('is at most 100 characters', async () => {
    const created = await create('alice', ids.alicePersonal);
    const response = await update(created.id, { merchant: 'x'.repeat(101) });
    expect(response.statusCode).toBe(422);
  });

  it('changes without touching the due dates, and the change is logged', async () => {
    const created = await create('alice', ids.alicePersonal, { merchant: 'Chase' });
    const dueDates = await occurrencesOf(created.id);

    expect((await update(created.id, { merchant: 'Citi' })).json()).toMatchObject({
      merchant: 'Citi',
    });
    // Leaving it out keeps it, and emptying it removes it.
    expect((await update(created.id, { notes: 'Card ending 0000' })).json()).toMatchObject({
      merchant: 'Citi',
    });
    expect((await update(created.id, { merchant: '' })).json()).toMatchObject({ merchant: null });

    expect(await occurrencesOf(created.id)).toEqual(dueDates);
    const logged = await test.database.orm
      .select({ before: activityLog.before, after: activityLog.after })
      .from(activityLog)
      .where(and(eq(activityLog.entityId, created.id), eq(activityLog.action, 'updated')));
    expect(logged).toHaveLength(3);
    expect(logged[0]).toEqual({ before: { merchant: 'changed' }, after: { merchant: 'changed' } });
  });
});
