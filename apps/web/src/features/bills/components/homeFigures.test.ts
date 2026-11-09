import type { CalendarDate } from '@remidy/domain';
import { describe, expect, it } from 'vitest';
import { homeFigures } from './homeFigures.ts';

const today = '2026-11-09' as CalendarDate;

const due = (
  dueOn: string,
  expectedCents: number | null,
  changes: { paidCents?: number; state?: 'open' | 'settled' | 'skipped' } = {},
) => ({
  dueOn,
  expectedCents,
  isVariable: expectedCents === null,
  state: changes.state ?? ('open' as const),
  paidCents: changes.paidCents ?? 0,
});

describe('homeFigures', () => {
  it('counts a bill that varies instead of adding it', () => {
    const figures = homeFigures([], [due('2026-11-12', 4_500), due('2026-11-20', null)], today, 0);
    expect(figures.leftToPay.value).toBe('$45.00 + 1 that varies');
    expect(figures.leftToPay.detail).toBe('2 bills');
  });

  it('counts what’s left of a partly paid bill', () => {
    const figures = homeFigures([], [due('2026-11-12', 4_500, { paidCents: 2_000 })], today, 2_000);
    expect(figures.leftToPay.value).toBe('$25.00');
    expect(figures.soon.value).toBe('$25.00');
  });

  it('adds overdue bills to what’s left, and says None without any', () => {
    const late = homeFigures([due('2026-11-01', 10_000)], [due('2026-11-12', 5_000)], today, 0);
    expect(late.leftToPay.value).toBe('$150.00');
    expect(late.overdue).toMatchObject({ value: '$100.00', detail: '1 bill', tone: 'danger' });
    const none = homeFigures([], [due('2026-11-12', 5_000)], today, 0);
    expect(none.overdue.value).toBe('None');
    expect(none.overdue.tone).toBeUndefined();
  });

  it('leaves out next month, and what’s paid or skipped', () => {
    const figures = homeFigures(
      [],
      [
        due('2026-12-02', 9_900),
        due('2026-11-12', 1_000, { state: 'settled', paidCents: 1_000 }),
        due('2026-11-13', 2_000, { state: 'skipped' }),
      ],
      today,
      1_000,
    );
    expect(figures.leftToPay.value).toBe('Nothing');
  });

  it('shows how much of the month is paid, without bills that vary', () => {
    const figures = homeFigures(
      [],
      [due('2026-11-12', 6_000), due('2026-11-20', null)],
      today,
      4_000,
    );
    expect(figures.paidPercent).toBe(40);
  });

  it('has no share paid with nothing to pay, or while payments load', () => {
    expect(homeFigures([], [], today, 0).paidPercent).toBeNull();
    expect(homeFigures([], [due('2026-11-12', 6_000)], today, null).paidPercent).toBeNull();
    expect(homeFigures([], [due('2026-11-12', 6_000)], today, null).paid.value).toBe('…');
  });

  it('counts only the next 7 days as soon', () => {
    const figures = homeFigures([], [due('2026-11-16', 1_000), due('2026-11-17', 2_000)], today, 0);
    expect(figures.soon).toMatchObject({ value: '$10.00', detail: '1 bill' });
  });
});
