import type { AgendaEntry } from '@remidy/contracts';
import { formatMoney, type CalendarDate, type Cents } from '@remidy/domain';
import { DAY_STATUS, dayStatusOf } from './dayStatus.ts';

export type DueEntry = Pick<
  AgendaEntry,
  'id' | 'spaceId' | 'name' | 'dueOn' | 'expectedCents' | 'isVariable' | 'state' | 'paidCents'
>;

/**
 * Said beside a due date whose bill pays itself, in words so it's not shown by an icon alone. The
 * hyphen doesn't break, so a narrow column never splits it over two lines.
 */
export const AUTOPAY = 'Auto‑pay';

/** A due date's status, with "Auto-pay" after it when its bill pays itself. */
export const withAutopay = (label: string, entry: Pick<AgendaEntry, 'autopay'>) =>
  entry.autopay ? `${label} · ${AUTOPAY}` : label;

/** What's still owed, or null when it can't be known: a bill that varies with nothing paid. */
export function remaining(entry: DueEntry): number | null {
  if (entry.state !== 'open') return 0;
  if (entry.isVariable) return entry.expectedCents;
  return Math.max(0, (entry.expectedCents ?? 0) - entry.paidCents);
}

/** A due date's status in words, and how it should look. */
export function statusOf(entry: DueEntry, overdue: boolean): { text: string; tone: string } {
  if (entry.state === 'settled') {
    return { text: `Paid ${formatMoney(entry.paidCents as Cents)}`, tone: 'text-paid' };
  }
  if (entry.state === 'skipped') return { text: 'Skipped', tone: 'text-ink-2' };
  const left = remaining(entry);
  const amount = left === null ? 'Varies' : formatMoney(left as Cents);
  const text = entry.paidCents > 0 ? `${amount} left` : amount;
  return { text, tone: overdue ? 'text-danger' : '' };
}

/**
 * A due date in one line: how it stands, then what's owed. Once it's paid or skipped, the words
 * already say how it stands, so "Paid" isn't said twice.
 */
export function dueSummary(entry: DueEntry, today: CalendarDate): string {
  const { text } = statusOf(entry, false);
  if (entry.state !== 'open') return text;
  return `${DAY_STATUS[dayStatusOf(entry, today)].label} · ${text}`;
}
