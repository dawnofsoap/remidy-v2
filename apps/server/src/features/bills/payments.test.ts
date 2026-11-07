import { activityLog, billOccurrence, payment } from '@remidy/db';
import { addDays } from '@remidy/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { recordAutopay } from './payments.repo.ts';
import { call, create, ids, now, test, useBillsHarness } from './testing.ts';

useBillsHarness();

interface Payment {
  id: string;
  amountCents: number;
  voided: boolean;
  voidReason: string | null;
  paidByName: string | null;
  voidedByName: string | null;
  source: string;
}
interface Due {
  id: string;
  dueOn: string;
  state: string;
  payments: Payment[];
}

const once = (firstDue: string) => ({ schedule: { kind: 'once', firstDue } });

async function dueOf(billId: string) {
  const [row] = await test.database.orm
    .select({ id: billOccurrence.id, state: billOccurrence.state })
    .from(billOccurrence)
    .where(eq(billOccurrence.billId, billId))
    .orderBy(asc(billOccurrence.dueOn));
  return { id: row?.id ?? '', state: row?.state ?? '' };
}

const pay = (
  who: string,
  spaceId: string,
  occurrenceId: string,
  amountCents: number,
  paidOn = now(),
) =>
  call(who, 'POST', `/api/v1/spaces/${spaceId}/occurrences/${occurrenceId}/payments`, {
    paidOn,
    amountCents,
  });
const voidIt = (who: string, spaceId: string, paymentId: string, reason = 'Charged twice') =>
  call(who, 'POST', `/api/v1/spaces/${spaceId}/payments/${paymentId}/void`, { reason });
const history = async (who: string, spaceId: string, billId: string) =>
  (await call(who, 'GET', `/api/v1/spaces/${spaceId}/bills/${billId}/history`)).json<Due[]>();

async function newDue(overrides: object = {}) {
  const created = await create('alice', ids.alicePersonal, { ...once(now()), ...overrides });
  return { bill: created, due: await dueOf(created.id) };
}

describe('paying a due date', () => {
  it('settles it in full, records who paid, and logs it', async () => {
    const { bill, due } = await newDue();
    const response = await pay('alice', ids.alicePersonal, due.id, 4500);
    expect(response.statusCode).toBe(201);
    expect(response.json<Payment>()).toMatchObject({
      amountCents: 4500,
      paidByName: 'alice',
      source: 'manual',
    });
    expect((await dueOf(bill.id)).state).toBe('settled');

    const [logged] = await test.database.orm
      .select({ action: activityLog.action, entity: activityLog.entity })
      .from(activityLog)
      .where(eq(activityLog.entityId, response.json<Payment>().id));
    expect(logged).toEqual({ action: 'recorded', entity: 'payment' });
  });

  it('adds partial payments until they reach the amount, and shows what’s paid on the agenda', async () => {
    const { bill, due } = await newDue();
    await pay('alice', ids.alicePersonal, due.id, 2000);
    expect((await dueOf(bill.id)).state).toBe('open');
    const agenda = (await call('alice', 'GET', `/api/v1/agenda?from=${now()}&to=${now()}`)).json<{
      upcoming: { id: string; paidCents: number }[];
    }>();
    expect(agenda.upcoming.find((entry) => entry.id === due.id)?.paidCents).toBe(2000);

    await pay('alice', ids.alicePersonal, due.id, 2500);
    expect((await dueOf(bill.id)).state).toBe('settled');
  });

  it('settles a bill that varies with its first payment', async () => {
    const { bill, due } = await newDue({ isVariable: true, expectedCents: null });
    await pay('alice', ids.alicePersonal, due.id, 1);
    expect((await dueOf(bill.id)).state).toBe('settled');
  });

  it.each([
    ['a date in the future', { paidOn: addDays(now(), 2), amountCents: 100 }, 'paidOn'],
    ['a day that doesn’t exist', { paidOn: '2026-02-30', amountCents: 100 }, 'paidOn'],
    ['nothing paid', { paidOn: now(), amountCents: 0 }, 'amountCents'],
  ])('refuses %s', async (_case, body, path) => {
    const { due } = await newDue();
    const response = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/occurrences/${due.id}/payments`,
      body,
    );
    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(response.json())).toContain(path);
  });
});

describe('voiding', () => {
  it('stops a payment counting but keeps it in the history, with who and why', async () => {
    const { bill, due } = await newDue();
    const paid = (await pay('alice', ids.alicePersonal, due.id, 4500)).json<Payment>();
    const voided = await voidIt('alice', ids.alicePersonal, paid.id);
    expect(voided.json<Payment>()).toMatchObject({
      voided: true,
      voidReason: 'Charged twice',
      voidedByName: 'alice',
    });
    expect((await dueOf(bill.id)).state).toBe('open');

    const [entry] = await history('alice', ids.alicePersonal, bill.id);
    expect(entry?.payments).toEqual([expect.objectContaining({ id: paid.id, voided: true })]);
    expect((await voidIt('alice', ids.alicePersonal, paid.id)).statusCode).toBe(409);
  });

  it('can’t be undone or got around in the database', async () => {
    const { due } = await newDue();
    const paid = (await pay('alice', ids.alicePersonal, due.id, 4500)).json<Payment>();
    const orm = test.database.orm;
    await expect(orm.delete(payment).where(eq(payment.id, paid.id))).rejects.toThrow();
    await expect(
      orm.update(payment).set({ amountCents: 1 }).where(eq(payment.id, paid.id)),
    ).rejects.toThrow();
    await voidIt('alice', ids.alicePersonal, paid.id);
    await expect(
      orm.update(payment).set({ voidedAt: null, voidReason: null }).where(eq(payment.id, paid.id)),
    ).rejects.toThrow();
  });
});

describe('skipping', () => {
  it('takes a due date out of what’s owed, and can be undone', async () => {
    const { bill, due } = await newDue(once(addDays(now(), -1)));
    const skip = (action: string) =>
      call('alice', 'POST', `/api/v1/spaces/${ids.alicePersonal}/occurrences/${due.id}/${action}`);
    expect((await skip('skip')).json()).toEqual({ state: 'skipped' });
    const agenda = (await call('alice', 'GET', `/api/v1/agenda?from=${now()}&to=${now()}`)).json<{
      overdue: unknown[];
    }>();
    expect(agenda.overdue).toEqual([]);
    expect((await pay('alice', ids.alicePersonal, due.id, 100)).statusCode).toBe(409);

    expect((await skip('unskip')).json()).toEqual({ state: 'open' });
    expect((await dueOf(bill.id)).state).toBe('open');
  });

  it('refuses a due date with payments', async () => {
    const { due } = await newDue();
    await pay('alice', ids.alicePersonal, due.id, 100);
    const response = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/occurrences/${due.id}/skip`,
    );
    expect(response.statusCode).toBe(409);
  });
});

describe('who can pay', () => {
  it('lets any household member pay a shared bill', async () => {
    const shared = await create('alice', ids.household, once(now()));
    const due = await dueOf(shared.id);
    const response = await pay('bob', ids.household, due.id, 4500);
    expect(response.statusCode).toBe(201);
    expect(response.json<Payment>().paidByName).toBe('bob');
  });

  it('keeps everyone else out, even with the right ids', async () => {
    const { bill, due } = await newDue();
    // Through the household Bob belongs to, the due date reads as missing.
    expect((await pay('bob', ids.household, due.id, 100)).statusCode).toBe(404);
    expect((await pay('carol', ids.alicePersonal, due.id, 100)).statusCode).toBe(404);
    const theirs = await call(
      'bob',
      'GET',
      `/api/v1/spaces/${ids.household}/bills/${bill.id}/history`,
    );
    expect(theirs.statusCode).toBe(404);
  });
});

describe('a bill with payments', () => {
  it('can’t be deleted, only archived', async () => {
    const { bill, due } = await newDue();
    await pay('alice', ids.alicePersonal, due.id, 4500);
    const response = await call(
      'alice',
      'DELETE',
      `/api/v1/spaces/${ids.alicePersonal}/bills/${bill.id}`,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'has_payments' } });
    expect((await history('alice', ids.alicePersonal, bill.id)).length).toBe(1);
  });
});

describe('auto-pay', () => {
  const autopayFor = async (billId: string) =>
    test.database.orm
      .select({ source: payment.source, paidOn: payment.paidOn, voidedAt: payment.voidedAt })
      .from(payment)
      .innerJoin(billOccurrence, eq(billOccurrence.id, payment.occurrenceId))
      .where(and(eq(billOccurrence.billId, billId), eq(payment.source, 'autopay')));

  it('records a fixed bill as paid on its due date, once', async () => {
    const { bill } = await newDue({ autopay: true, ...once(addDays(now(), -1)) });
    expect(await recordAutopay(test.database.orm)).toBeGreaterThanOrEqual(1);
    await recordAutopay(test.database.orm);
    expect(await autopayFor(bill.id)).toEqual([
      { source: 'autopay', paidOn: addDays(now(), -1), voidedAt: null },
    ]);
    expect((await dueOf(bill.id)).state).toBe('settled');
  });

  it('doesn’t record it again after it was voided because the charge failed', async () => {
    const { bill } = await newDue({ autopay: true });
    await recordAutopay(test.database.orm);
    const [entry] = await history('alice', ids.alicePersonal, bill.id);
    await voidIt('alice', ids.alicePersonal, entry?.payments[0]?.id ?? '', 'Card declined');
    await recordAutopay(test.database.orm);
    expect((await autopayFor(bill.id)).length).toBe(1);
    expect((await dueOf(bill.id)).state).toBe('open');
  });

  it.each([
    ['a bill that varies', { autopay: true, isVariable: true, expectedCents: null }],
    ['a due date still to come', { autopay: true, ...once(addDays(now(), 3)) }],
    ['a bill without auto-pay', { autopay: false }],
  ])('leaves %s alone', async (_case, overrides) => {
    const { bill } = await newDue(overrides);
    await recordAutopay(test.database.orm);
    expect(await autopayFor(bill.id)).toEqual([]);
  });

  it('leaves a due date someone already paid', async () => {
    const { bill, due } = await newDue({ autopay: true });
    await pay('alice', ids.alicePersonal, due.id, 4500);
    await recordAutopay(test.database.orm);
    expect(await autopayFor(bill.id)).toEqual([]);
    const total = await test.database.orm.execute(
      sql`select count(*)::int as n from payment where occurrence_id = ${due.id}`,
    );
    expect(total.rows[0]).toEqual({ n: 1 });
  });
});
