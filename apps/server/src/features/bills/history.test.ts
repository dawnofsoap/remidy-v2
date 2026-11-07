import { billOccurrence } from '@remidy/db';
import { addDays, type CalendarDate } from '@remidy/domain';
import { asc, eq } from 'drizzle-orm';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { periodTotals } from './agenda.repo.ts';
import { addPastDueDate, call, create, ids, now, test, useBillsHarness } from './testing.ts';

useBillsHarness();

// The main test for milestone 4: whatever happens to bills today, what was due and paid in the past
// stays as it was. Random bills get past due dates and payments, then random edits, archives,
// moves and new payments, and every past period's totals are checked before and after.

const PAST: [CalendarDate, CalendarDate] = ['2020-01-01' as CalendarDate, addDays(now(), -1)];
const PERIODS: [CalendarDate, CalendarDate][] = [
  PAST,
  ['2020-01-01' as CalendarDate, '2020-06-30' as CalendarDate],
  ['2020-07-01' as CalendarDate, '2020-12-31' as CalendarDate],
];

const totals = () =>
  Promise.all(PERIODS.map(([from, to]) => periodTotals(test.database.orm, 'alice', from, to)));

const edit = fc.oneof(
  fc.record({ kind: fc.constant('rename'), name: fc.string({ minLength: 1, maxLength: 20 }) }),
  fc.record({ kind: fc.constant('amount'), cents: fc.integer({ min: 1, max: 500_000 }) }),
  fc.record({
    kind: fc.constant('schedule'),
    every: fc.integer({ min: 1, max: 6 }),
    day: fc.integer({ min: 1, max: 28 }),
  }),
  fc.record({ kind: fc.constant('archive'), archived: fc.boolean() }),
  fc.record({ kind: fc.constant('move') }),
  fc.record({ kind: fc.constant('payToday'), cents: fc.integer({ min: 1, max: 500_000 }) }),
);

const pastDates = fc.uniqueArray(fc.integer({ min: 0, max: 360 }), { minLength: 1, maxLength: 4 });

describe('history invariance', () => {
  it('never changes a past period’s totals, whatever happens to bills now', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            cents: fc.integer({ min: 1, max: 500_000 }),
            past: pastDates,
            paid: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
            edits: fc.array(edit, { maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        async (bills) => {
          const created: { id: string; spaceId: string; paymentIds: string[] }[] = [];
          for (const [index, sample] of bills.entries()) {
            const bill = await create('alice', ids.alicePersonal, {
              name: `Bill ${String(index)}`,
              expectedCents: sample.cents,
            });
            const paymentIds: string[] = [];
            for (const [n, daysAgo] of sample.past.entries()) {
              const dueOn = addDays('2020-03-01' as CalendarDate, daysAgo);
              await addPastDueDate({ ...bill, name: bill.name }, dueOn);
              if (!sample.paid[n]) continue;
              const [due] = await test.database.orm
                .select({ id: billOccurrence.id })
                .from(billOccurrence)
                .where(eq(billOccurrence.billId, bill.id))
                .orderBy(asc(billOccurrence.dueOn))
                .offset(n);
              const paid = await call(
                'alice',
                'POST',
                `/api/v1/spaces/${ids.alicePersonal}/occurrences/${due?.id ?? ''}/payments`,
                {
                  paidOn: dueOn,
                  amountCents: sample.cents,
                },
              );
              paymentIds.push(paid.json<{ id: string }>().id);
            }
            created.push({ id: bill.id, spaceId: ids.alicePersonal, paymentIds });
          }

          const before = await totals();

          for (const [index, sample] of bills.entries()) {
            const target = created[index];
            if (!target) continue;
            for (const change of sample.edits) {
              const url = `/api/v1/spaces/${target.spaceId}/bills/${target.id}`;
              if (change.kind === 'rename')
                await call('alice', 'PATCH', url, { name: change.name });
              if (change.kind === 'amount')
                await call('alice', 'PATCH', url, { expectedCents: change.cents });
              if (change.kind === 'archive')
                await call('alice', 'PATCH', url, { archived: change.archived });
              if (change.kind === 'schedule') {
                await call('alice', 'PATCH', url, {
                  schedule: {
                    kind: 'repeat',
                    unit: 'month',
                    every: change.every,
                    firstDue: `2026-01-${String(change.day).padStart(2, '0')}`,
                    lastDue: null,
                  },
                });
              }
              if (change.kind === 'move') {
                const to = target.spaceId === ids.alicePersonal ? ids.household : ids.alicePersonal;
                const moved = await call('alice', 'POST', `${url}/move`, { toSpaceId: to });
                if (moved.statusCode === 200) target.spaceId = to;
              }
              if (change.kind === 'payToday') {
                const [due] = await test.database.orm
                  .select({ id: billOccurrence.id })
                  .from(billOccurrence)
                  .where(eq(billOccurrence.billId, target.id))
                  .orderBy(asc(billOccurrence.dueOn))
                  .limit(1);
                await call(
                  'alice',
                  'POST',
                  `/api/v1/spaces/${target.spaceId}/occurrences/${due?.id ?? ''}/payments`,
                  {
                    paidOn: now(),
                    amountCents: change.cents,
                  },
                );
              }
            }
          }

          expect(await totals()).toEqual(before);
        },
      ),
      { numRuns: 12 },
    );
  }, 240_000);

  it('changes a past period only by a visible void, and by exactly that payment', async () => {
    const bill = await create('alice', ids.alicePersonal, { expectedCents: 5000 });
    await addPastDueDate(bill, '2020-03-15');
    const [due] = await test.database.orm
      .select({ id: billOccurrence.id })
      .from(billOccurrence)
      .where(eq(billOccurrence.billId, bill.id))
      .orderBy(asc(billOccurrence.dueOn))
      .limit(1);
    const paid = await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/occurrences/${due?.id ?? ''}/payments`,
      {
        paidOn: '2020-03-16',
        amountCents: 5000,
      },
    );
    const [before] = await totals();
    await call(
      'alice',
      'POST',
      `/api/v1/spaces/${ids.alicePersonal}/payments/${paid.json<{ id: string }>().id}/void`,
      {
        reason: 'Paid by mistake',
      },
    );
    const [after] = await totals();
    expect(after).toEqual({ ...before, paidCents: (before?.paidCents ?? 0) - 5000 });
  });
});
