import type { CalendarDate } from '@remidy/domain';
import { describe, expect, it } from 'vitest';
import { monthTotals } from './monthTotals.ts';

const today = '2026-03-15' as CalendarDate;
const due = (
  dueOn: string,
  expectedCents: number | null,
  state: 'open' | 'settled' | 'skipped' = 'open',
  paidCents = 0,
) => ({ dueOn, expectedCents, isVariable: expectedCents === null, state, paidCents });

describe('the totals for a month on the Calendar', () => {
  it('takes due and paid from the totals, counting bills that vary rather than adding them', () => {
    const totals = monthTotals([], today, { dueCents: 12_000, unknownCount: 2, paidCents: 4_500 });
    expect(totals.due).toBe('$120.00 + 2 that vary');
    expect(totals.paid).toBe('$45.00');
  });

  it('waits for the totals, and says when they couldn’t load', () => {
    expect(monthTotals([], today, null).due).toBe('…');
    expect(monthTotals([], today, null).paid).toBe('…');
    expect(monthTotals([], today, 'error').due).toBe('Unavailable');
  });

  it('counts what’s left on the month’s open due dates, and nothing paid or skipped', () => {
    const totals = monthTotals(
      [
        due('2026-03-20', 10_000),
        due('2026-03-22', 6_000, 'open', 2_000),
        due('2026-03-25', null),
        due('2026-03-02', 3_000, 'settled', 3_000),
        due('2026-03-03', 9_000, 'skipped'),
      ],
      today,
      null,
    );
    expect(totals.left).toBe('$140.00 + 1 that varies');
  });

  it('calls open due dates before today overdue, and says None when there are none', () => {
    const late = monthTotals(
      [due('2026-03-10', 5_000, 'open', 1_000), due('2026-03-20', 10_000)],
      today,
      null,
    );
    expect(late.overdue).toBe('$40.00');
    expect(late.overdueCount).toBe(1);
    expect(monthTotals([due('2026-03-20', 10_000)], today, null).overdue).toBe('None');
    expect(monthTotals([], today, null).left).toBe('Nothing');
  });
});
