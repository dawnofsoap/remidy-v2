import type { TotalsResponse } from '@remidy/contracts';
import { formatMoney, type CalendarDate, type Cents } from '@remidy/domain';
import { owed, plural, totalText, type Entry } from './homeFigures.ts';

export interface MonthTotals {
  due: string;
  paid: string;
  left: string;
  overdue: string;
  overdueCount: number;
}

/** The totals still loading, or failed to. */
type Totals = TotalsResponse | null | 'error';

const fromTotals = (totals: Totals, text: (loaded: TotalsResponse) => string) =>
  totals === null ? '…' : totals === 'error' ? 'Unavailable' : text(totals);

/**
 * A month's totals for the Calendar. Due and paid come from the totals route, by the one
 * definition every screen uses. What's left and what's overdue come from the month's due dates,
 * counting only what's still owed on each.
 */
export function monthTotals(entries: Entry[], today: CalendarDate, totals: Totals): MonthTotals {
  const open = entries.filter((entry) => entry.state === 'open');
  const late = open.filter((entry) => entry.dueOn < today);
  return {
    due: fromTotals(totals, ({ dueCents, unknownCount }) => {
      const sum = formatMoney(dueCents as Cents);
      return unknownCount > 0
        ? `${sum} + ${plural(unknownCount, 'that varies', 'that vary')}`
        : sum;
    }),
    paid: fromTotals(totals, ({ paidCents }) => formatMoney(paidCents as Cents)),
    left: open.length > 0 ? totalText(owed(open)) : 'Nothing',
    overdue: late.length > 0 ? totalText(owed(late)) : 'None',
    overdueCount: late.length,
  };
}
