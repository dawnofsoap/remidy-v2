import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCalendarDate, type CalendarDate } from './dates.ts';
import { toCents } from './money.ts';
import {
  dueTotal,
  paidTotal,
  settle,
  suggestedAmount,
  type DueRecord,
  type PaymentRecord,
} from './settlement.ts';

const date = (text: string): CalendarDate => {
  const parsed = parseCalendarDate(text);
  if (!parsed) throw new Error(`Bad test date: ${text}`);
  return parsed;
};
const cents = (value: number) => toCents(value);

const fixed = (expected: number, overrides: Partial<DueRecord> = {}): DueRecord => ({
  dueOn: date('2026-03-01'),
  expectedCents: cents(expected),
  isVariable: false,
  skipped: false,
  ...overrides,
});
const pay = (amount: number, overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  amountCents: cents(amount),
  paidOn: date('2026-03-01'),
  voided: false,
  ...overrides,
});

describe('settling a due date', () => {
  it('is open with nothing paid, owing the expected amount', () => {
    expect(settle(fixed(5000), [])).toEqual({
      state: 'open',
      paidCents: 0,
      remainingCents: 5000,
      overpaidCents: 0,
    });
  });

  it('adds partial payments until they reach the expected amount', () => {
    expect(settle(fixed(5000), [pay(2000)])).toMatchObject({ state: 'open', remainingCents: 3000 });
    expect(settle(fixed(5000), [pay(2000), pay(3000)])).toMatchObject({
      state: 'settled',
      remainingCents: 0,
    });
  });

  it('settles when paid more than expected, and shows the extra', () => {
    expect(settle(fixed(5000), [pay(6000)])).toMatchObject({
      state: 'settled',
      remainingCents: 0,
      overpaidCents: 1000,
    });
  });

  it('never counts a voided payment', () => {
    expect(settle(fixed(5000), [pay(5000, { voided: true })])).toMatchObject({
      state: 'open',
      paidCents: 0,
      remainingCents: 5000,
    });
  });

  it('settles a bill that varies with its first payment, whatever it is', () => {
    const varies = fixed(4000, { isVariable: true });
    expect(settle(varies, [])).toMatchObject({ state: 'open', remainingCents: 4000 });
    expect(settle(varies, [pay(100)])).toMatchObject({ state: 'settled', remainingCents: 0 });
    expect(settle({ ...varies, expectedCents: null }, [])).toMatchObject({ remainingCents: null });
    // A voided payment doesn't count, so it's still open.
    expect(settle(varies, [pay(100, { voided: true })])).toMatchObject({ state: 'open' });
  });

  it('treats a skipped due date as owing nothing, while still showing anything paid', () => {
    expect(settle(fixed(5000, { skipped: true }), [pay(100)])).toEqual({
      state: 'skipped',
      paidCents: 100,
      remainingCents: 0,
      overpaidCents: 0,
    });
  });

  it('settles a free due date without any payment', () => {
    expect(settle(fixed(0), [])).toMatchObject({ state: 'settled' });
  });

  it('treats a fixed bill with no amount as free, rather than failing', () => {
    expect(settle({ ...fixed(0), expectedCents: null }, [])).toMatchObject({
      state: 'settled',
      remainingCents: 0,
    });
  });

  it('always has paid plus remaining at least the expected amount, for any payments', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(fc.record({ amount: fc.integer({ min: 0, max: 500_000 }), voided: fc.boolean() })),
        (expected, list) => {
          const payments = list.map((item) => pay(item.amount, { voided: item.voided }));
          const result = settle(fixed(expected), payments);
          const counted = list
            .filter((item) => !item.voided)
            .reduce((sum, item) => sum + item.amount, 0);
          expect(result.paidCents).toBe(counted);
          expect((result.remainingCents ?? 0) + result.paidCents - result.overpaidCents).toBe(
            expected,
          );
          expect(result.state === 'settled').toBe(
            counted >= expected && (expected === 0 || list.some((item) => !item.voided)),
          );
        },
      ),
    );
  });
});

describe('the suggested amount', () => {
  it('is what’s still owed, or the full amount once paid', () => {
    expect(suggestedAmount(fixed(5000), [pay(2000)])).toBe(3000);
    expect(suggestedAmount(fixed(5000), [])).toBe(5000);
    expect(suggestedAmount(fixed(5000), [pay(5000)])).toBe(5000);
  });

  it('is left empty for a bill that varies', () => {
    expect(suggestedAmount(fixed(4000, { isVariable: true }), [])).toBeNull();
  });
});

describe('totals', () => {
  const march = [date('2026-03-01'), date('2026-03-31')] as const;

  it('count what’s due by its due date, leaving out skipped ones and counting unknown amounts', () => {
    const dues = [
      fixed(5000, { dueOn: date('2026-03-05') }),
      fixed(2000, { dueOn: date('2026-03-31') }),
      fixed(9000, { dueOn: date('2026-04-01') }),
      fixed(7000, { dueOn: date('2026-03-10'), skipped: true }),
      { ...fixed(0, { dueOn: date('2026-03-20'), isVariable: true }), expectedCents: null },
    ];
    expect(dueTotal(dues, ...march)).toEqual({ cents: 7000, unknown: 1 });
  });

  it('count what’s paid by the date paid, never voided ones', () => {
    const payments = [
      pay(1000, { paidOn: date('2026-02-28') }),
      pay(2000, { paidOn: date('2026-03-01') }),
      pay(3000, { paidOn: date('2026-03-15'), voided: true }),
      pay(4000, { paidOn: date('2026-03-31') }),
    ];
    expect(paidTotal(payments, ...march)).toBe(6000);
  });

  it('add up the same however a period is split', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 31 }),
            amount: fc.integer({ min: 0, max: 100_000 }),
            voided: fc.boolean(),
          }),
        ),
        fc.integer({ min: 1, max: 30 }),
        (list, cut) => {
          const payments = list.map((item) =>
            pay(item.amount, {
              paidOn: date(`2026-03-${String(item.day).padStart(2, '0')}`),
              voided: item.voided,
            }),
          );
          const first = paidTotal(
            payments,
            march[0],
            date(`2026-03-${String(cut).padStart(2, '0')}`),
          );
          const rest = paidTotal(
            payments,
            date(`2026-03-${String(cut + 1).padStart(2, '0')}`),
            march[1],
          );
          expect(first + rest).toBe(paidTotal(payments, ...march));
        },
      ),
    );
  });
});
