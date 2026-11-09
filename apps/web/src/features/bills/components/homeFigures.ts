import type { AgendaEntry } from '@remidy/contracts';
import { addDays, formatMoney, sumCents, type CalendarDate, type Cents } from '@remidy/domain';

type Entry = Pick<AgendaEntry, 'dueOn' | 'expectedCents' | 'isVariable' | 'state' | 'paidCents'>;

export const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** What's still owed on each, so a partly paid bill counts what's left. */
function owed<T extends Entry>(entries: T[]): T[] {
  return entries.map((entry) => ({
    ...entry,
    expectedCents: entry.isVariable
      ? entry.expectedCents
      : Math.max(0, (entry.expectedCents ?? 0) - entry.paidCents),
  }));
}

const knownCents = (entries: Entry[]) =>
  sumCents(
    entries
      .filter((entry) => entry.expectedCents !== null)
      .map((entry) => entry.expectedCents as Cents),
  );

/** The total of the known amounts, and how many vary, since a varying bill has no amount yet. */
export function totalText(entries: Entry[]): string {
  const varies = entries.filter((entry) => entry.expectedCents === null).length;
  const sum = formatMoney(knownCents(entries));
  return varies > 0 ? `${sum} + ${plural(varies, 'that varies', 'that vary')}` : sum;
}

export interface Figure {
  label: string;
  value: string;
  detail: string;
  tone?: 'paid' | 'danger';
}

export interface HomeFigures {
  leftToPay: Figure;
  paid: Figure;
  overdue: Figure;
  soon: Figure;
  /** How much of the month's known amounts is paid, from 0 to 100, or null with nothing to pay. */
  paidPercent: number | null;
}

/**
 * Home's figures for the month: what's left, what's paid, what's late and what's next. Overdue
 * and upcoming are the agenda's; paid is the total of this month's payments, or null while loading.
 */
export function homeFigures(
  overdue: Entry[],
  upcoming: Entry[],
  today: CalendarDate,
  paidCents: number | null,
): HomeFigures {
  const month = today.slice(0, 7);
  const open = upcoming.filter((entry) => entry.state === 'open');
  const restOfMonth = open.filter((entry) => entry.dueOn.startsWith(month));
  const soon = open.filter((entry) => entry.dueOn <= addDays(today, 7));
  const left = owed([...overdue, ...restOfMonth]);
  const leftCents = knownCents(left);
  const whole = (paidCents ?? 0) + leftCents;

  return {
    leftToPay: {
      label: 'Left to pay this month',
      value: left.length > 0 ? totalText(left) : 'Nothing',
      detail: plural(left.length, 'bill', 'bills'),
    },
    paid: {
      label: 'Paid this month',
      value: paidCents === null ? '…' : formatMoney(paidCents as Cents),
      detail: 'Payments made since the 1st',
      tone: 'paid',
    },
    overdue: {
      label: 'Overdue',
      value: overdue.length > 0 ? totalText(owed(overdue)) : 'None',
      detail: plural(overdue.length, 'bill', 'bills'),
      ...(overdue.length > 0 ? { tone: 'danger' as const } : {}),
    },
    soon: {
      label: 'Due in the next 7 days',
      value: soon.length > 0 ? totalText(owed(soon)) : 'Nothing',
      detail: plural(soon.length, 'bill', 'bills'),
    },
    paidPercent: paidCents === null || whole === 0 ? null : Math.round((paidCents / whole) * 100),
  };
}
