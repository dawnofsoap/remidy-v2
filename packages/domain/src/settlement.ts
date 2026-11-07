import { compareDates, type CalendarDate } from './dates.ts';
import { sumCents, type Cents } from './money.ts';

/** A payment as far as settling goes: how much, when, and whether it was voided. */
export interface PaymentRecord {
  amountCents: Cents;
  paidOn: CalendarDate;
  voided: boolean;
}

/** One due date: what was expected, and whether it was skipped. */
export interface DueRecord {
  dueOn: CalendarDate;
  /** Null for a bill that varies with no usual amount. */
  expectedCents: Cents | null;
  isVariable: boolean;
  skipped: boolean;
}

export type DueState = 'open' | 'settled' | 'skipped';

export interface Settlement {
  state: DueState;
  /** What non-voided payments add up to. */
  paidCents: Cents;
  /** What's still owed, or null when it can't be known: a bill that varies and has no payment. */
  remainingCents: Cents | null;
  /** How much more than expected was paid. */
  overpaidCents: Cents;
}

const ZERO = 0 as Cents;

/**
 * Where a due date stands, from its payments. Voided payments never count. A fixed bill settles when
 * payments reach the expected amount. A bill that varies settles with its first payment, whatever
 * it is, since there's nothing to compare it to.
 */
export function settle(due: DueRecord, payments: readonly PaymentRecord[]): Settlement {
  const paidCents = sumCents(
    payments.filter((payment) => !payment.voided).map((p) => p.amountCents),
  );
  if (due.skipped) {
    return { state: 'skipped', paidCents, remainingCents: ZERO, overpaidCents: ZERO };
  }
  const paidSomething = payments.some((payment) => !payment.voided);

  if (due.isVariable) {
    return {
      state: paidSomething ? 'settled' : 'open',
      paidCents,
      remainingCents: paidSomething ? ZERO : due.expectedCents,
      overpaidCents: ZERO,
    };
  }
  const expected = due.expectedCents ?? ZERO;
  const remaining = Math.max(0, expected - paidCents) as Cents;
  return {
    state: remaining === 0 && (paidSomething || expected === 0) ? 'settled' : 'open',
    paidCents,
    remainingCents: remaining,
    overpaidCents: Math.max(0, paidCents - expected) as Cents,
  };
}

/** What a payment form should offer: what's still owed, or nothing for a bill that varies. */
export function suggestedAmount(due: DueRecord, payments: readonly PaymentRecord[]): Cents | null {
  if (due.isVariable) return null;
  const { remainingCents } = settle(due, payments);
  return remainingCents && remainingCents > 0 ? remainingCents : due.expectedCents;
}

const inRange = (date: CalendarDate, from: CalendarDate, to: CalendarDate) =>
  compareDates(date, from) >= 0 && compareDates(date, to) <= 0;

/**
 * "Due" in a period: the expected amounts of due dates that fall in it, not skipped. Bills that
 * vary with no usual amount are counted separately, since they have no amount to add.
 */
export function dueTotal(
  dues: readonly DueRecord[],
  from: CalendarDate,
  to: CalendarDate,
): { cents: Cents; unknown: number } {
  const counted = dues.filter((due) => !due.skipped && inRange(due.dueOn, from, to));
  return {
    cents: sumCents(
      counted.flatMap((due) => (due.expectedCents === null ? [] : [due.expectedCents])),
    ),
    unknown: counted.filter((due) => due.expectedCents === null).length,
  };
}

/** "Paid" in a period: payments made in it, by the date paid, never counting voided ones. */
export function paidTotal(
  payments: readonly PaymentRecord[],
  from: CalendarDate,
  to: CalendarDate,
): Cents {
  return sumCents(
    payments
      .filter((payment) => !payment.voided && inRange(payment.paidOn, from, to))
      .map((payment) => payment.amountCents),
  );
}
