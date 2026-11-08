import type { AgendaEntry } from '@remidy/contracts';
import { formatMoney, type Cents } from '@remidy/domain';

export type DueEntry = Pick<
  AgendaEntry,
  'id' | 'spaceId' | 'name' | 'dueOn' | 'expectedCents' | 'isVariable' | 'state' | 'paidCents'
>;

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
