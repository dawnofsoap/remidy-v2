import { billOccurrence } from '@remidy/db';
import { addDays } from '@remidy/domain';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { call, create, ids, now, useBillsHarness, test } from './testing.ts';

useBillsHarness();

interface Listed {
  name: string;
  amountCents: number;
  paidOn: string;
  shared: boolean;
  paidByName: string | null;
}

const once = (firstDue: string) => ({ schedule: { kind: 'once', firstDue } });

async function dueOf(billId: string) {
  const [row] = await test.database.orm
    .select({ id: billOccurrence.id })
    .from(billOccurrence)
    .where(eq(billOccurrence.billId, billId))
    .orderBy(asc(billOccurrence.dueOn));
  return row?.id ?? '';
}

/** A bill due today in a space, paid there by someone, returning the payment's ID. */
async function paid(
  who: string,
  spaceId: string,
  name: string,
  amountCents: number,
  paidOn = now(),
) {
  const bill = await create(who, spaceId, { name, ...once(now()) });
  const response = await call(
    who,
    'POST',
    `/api/v1/spaces/${spaceId}/occurrences/${await dueOf(bill.id)}/payments`,
    { paidOn, amountCents },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ id: string }>().id;
}

const listFor = async (who: string, from = addDays(now(), -30), to = now()) =>
  (await call(who, 'GET', `/api/v1/payments?from=${from}&to=${to}`)).json<Listed[]>();

describe('the payments in a period', () => {
  it('lists them newest first, with the bill’s name and who paid', async () => {
    await paid('alice', ids.alicePersonal, 'Water', 4_500, addDays(now(), -3));
    await paid('alice', ids.alicePersonal, 'Phone', 6_000, now());
    expect(await listFor('alice')).toMatchObject([
      { name: 'Phone', amountCents: 6_000, paidOn: now(), shared: false, paidByName: 'alice' },
      { name: 'Water', amountCents: 4_500, paidOn: addDays(now(), -3) },
    ]);
  });

  it('leaves out voided payments and those outside the period', async () => {
    const wrong = await paid('alice', ids.alicePersonal, 'Water', 4_500);
    await call('alice', 'POST', `/api/v1/spaces/${ids.alicePersonal}/payments/${wrong}/void`, {
      reason: 'Wrong bill',
    });
    await paid('alice', ids.alicePersonal, 'Gym', 3_000, addDays(now(), -40));
    await paid('alice', ids.alicePersonal, 'Phone', 6_000);
    expect((await listFor('alice')).map((entry) => entry.name)).toEqual(['Phone']);
  });

  it('only includes spaces the person belongs to', async () => {
    await paid('alice', ids.alicePersonal, 'Alice’s phone', 6_000);
    await paid('alice', ids.household, 'Rent', 145_000);
    await paid('bob', ids.bobPersonal, 'Bob’s gym', 3_000);

    const names = async (who: string) => (await listFor(who)).map((entry) => entry.name).sort();
    expect(await names('alice')).toEqual(['Alice’s phone', 'Rent']);
    expect(await names('bob')).toEqual(['Bob’s gym', 'Rent']);
    expect(await names('carol')).toEqual([]);
    expect((await listFor('bob')).find((entry) => entry.name === 'Rent')?.shared).toBe(true);
  });

  it('refuses a range that’s backwards or too long', async () => {
    const backwards = await call(
      'alice',
      'GET',
      `/api/v1/payments?from=${now()}&to=${addDays(now(), -1)}`,
    );
    expect(backwards.statusCode).toBe(422);
    const long = await call('alice', 'GET', `/api/v1/payments?from=2020-01-01&to=${now()}`);
    expect(long.statusCode).toBe(422);
  });
});
