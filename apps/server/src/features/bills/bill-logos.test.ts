import { activityLog } from '@remidy/db';
import { addDays } from '@remidy/domain';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { drawSampleLogo, storeLogo } from '../logos/index.ts';
import {
  agendaFor,
  call,
  create,
  ids,
  now,
  occurrencesOf,
  test,
  useBillsHarness,
} from './testing.ts';

useBillsHarness();

const newLogo = (shape: 'circle' | 'ring' = 'circle') =>
  storeLogo(test.database.orm, drawSampleLogo([30, 90, 160], shape));

const update = (billId: string, changes: object) =>
  call('alice', 'PATCH', `/api/v1/spaces/${ids.alicePersonal}/bills/${billId}`, changes);

describe('a bill’s logo', () => {
  it('is saved with the bill, and shown on its due dates', async () => {
    const logoId = await newLogo();
    const created = await create('alice', ids.alicePersonal, { logoId });
    expect(created).toMatchObject({ logoId });
    const { upcoming } = await agendaFor('alice', now(), addDays(now(), 40));
    expect(upcoming.length).toBeGreaterThan(0);
    expect(upcoming.every((entry) => (entry as { logoId?: string }).logoId === logoId)).toBe(true);
  });

  it('is optional, so older copies of the app keep working', async () => {
    expect(await create('alice', ids.alicePersonal)).toMatchObject({ logoId: null });
  });

  it('must be a logo that exists', async () => {
    const response = await call('alice', 'POST', `/api/v1/spaces/${ids.alicePersonal}/bills`, {
      name: 'Water',
      expectedCents: 4500,
      isVariable: false,
      schedule: { kind: 'once', firstDue: now() },
      categoryId: null,
      autopay: false,
      url: null,
      notes: null,
      logoId: '0198c0de-0000-7000-8000-000000000000',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { fields: { path: string }[] } }>().error.fields[0]?.path).toBe(
      'logoId',
    );
  });

  it('changes and is removed without touching the due dates, and the change is logged', async () => {
    const first = await newLogo();
    const second = await newLogo('ring');
    const created = await create('alice', ids.alicePersonal, { logoId: first });
    const dueDates = await occurrencesOf(created.id);

    const changed = await update(created.id, { logoId: second });
    expect(changed.json()).toMatchObject({ logoId: second });
    // Leaving it out keeps it.
    expect((await update(created.id, { name: 'Water bill' })).json()).toMatchObject({
      logoId: second,
    });
    expect((await update(created.id, { logoId: null })).json()).toMatchObject({ logoId: null });

    expect(await occurrencesOf(created.id)).toEqual(
      dueDates.map((due) => ({ ...due, name: 'Water bill' })),
    );
    const logged = await test.database.orm
      .select({ before: activityLog.before, after: activityLog.after })
      .from(activityLog)
      .where(and(eq(activityLog.entityId, created.id), eq(activityLog.action, 'updated')));
    expect(logged[0]).toEqual({ before: { logoId: 'changed' }, after: { logoId: 'changed' } });
    expect(logged).toHaveLength(3);
  });
});
