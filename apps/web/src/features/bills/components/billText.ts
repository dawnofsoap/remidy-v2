import {
  addDays,
  dueDates,
  formatDate,
  formatMoney,
  today,
  type Cents,
  type Schedule,
} from '@remidy/domain';
import type { Bill } from '../api.ts';

export const amountText = (bill: { expectedCents: number | null; isVariable: boolean }) =>
  bill.expectedCents === null
    ? 'Varies'
    : `${formatMoney(bill.expectedCents as Cents)}${bill.isVariable ? ', varies' : ''}`;

/** The next due date from today, in words, or a dash when there isn't one. */
export function nextDue(bill: Bill): string {
  if (bill.archived) return '—';
  const from = today(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [next] = dueDates(bill.schedule as Schedule, from, addDays(from, 800));
  return next ? formatDate(next, 'short') : '—';
}
