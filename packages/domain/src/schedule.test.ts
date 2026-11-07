import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  dateFromParts,
  datePartsOf,
  daysBetween,
  parseCalendarDate,
  type CalendarDate,
} from './dates.ts';
import {
  describeSchedule,
  dueDates,
  MAX_EVERY,
  scheduleProblem,
  type RepeatUnit,
  type Schedule,
} from './schedule.ts';

const date = (text: string): CalendarDate => {
  const parsed = parseCalendarDate(text);
  if (!parsed) throw new Error(`Bad test date: ${text}`);
  return parsed;
};

const repeat = (
  unit: RepeatUnit,
  every: number,
  firstDue: string,
  lastDue: string | null = null,
): Schedule => ({
  kind: 'repeat',
  unit,
  every,
  firstDue: date(firstDue),
  lastDue: lastDue ? date(lastDue) : null,
});

const once = (firstDue: string): Schedule => ({ kind: 'once', firstDue: date(firstDue) });

const anyDate = fc
  .record({
    year: fc.integer({ min: 1990, max: 2060 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ year, month, day }) => {
    for (let candidate = day; candidate >= 28; candidate -= 1) {
      const built = dateFromParts(year, month, candidate);
      if (built) return built;
    }
    return dateFromParts(year, month, Math.min(day, 28)) ?? date('2000-01-01');
  });

const anySchedule: fc.Arbitrary<Schedule> = fc.oneof(
  anyDate.map((firstDue): Schedule => ({ kind: 'once', firstDue })),
  fc
    .record({
      unit: fc.constantFrom<RepeatUnit>('week', 'month', 'year'),
      every: fc.integer({ min: 1, max: 12 }),
      firstDue: anyDate,
      lastAfter: fc.option(fc.integer({ min: 0, max: 4000 })),
    })
    .map(({ unit, every, firstDue, lastAfter }): Schedule => ({
      kind: 'repeat',
      unit,
      every,
      firstDue,
      lastDue: lastAfter === null ? null : addDays(firstDue, lastAfter),
    })),
);

const anyRange = fc
  .tuple(anyDate, fc.integer({ min: 0, max: 800 }))
  .map(([from, length]) => [from, addDays(from, length)] as const);

/** Counting every due date from the first, with no shortcuts, to check the real one against. */
function slowDueDates(schedule: Schedule, from: CalendarDate, to: CalendarDate) {
  if (schedule.kind === 'once') return dueDates(schedule, from, to);
  const dates: CalendarDate[] = [];
  for (let n = 0; ; n += 1) {
    const step = schedule.unit === 'week' ? 7 : schedule.unit === 'year' ? 12 : 1;
    const due =
      schedule.unit === 'week'
        ? addDays(schedule.firstDue, step * schedule.every * n)
        : dueDates({ ...schedule, kind: 'repeat', lastDue: null }, schedule.firstDue, to).at(n);
    if (!due) break;
    if (compareDates(due, to) > 0) break;
    if (schedule.lastDue && compareDates(due, schedule.lastDue) > 0) break;
    if (compareDates(due, from) >= 0) dates.push(due);
  }
  return dates;
}

describe('due dates', () => {
  it('keeps the day of the month, using the last day of shorter months', () => {
    expect(
      dueDates(repeat('month', 1, '2026-01-31'), date('2026-01-01'), date('2026-06-30')),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  });

  it('uses Feb 29 in a leap year', () => {
    expect(
      dueDates(repeat('month', 1, '2028-01-30'), date('2028-02-01'), date('2028-03-31')),
    ).toEqual(['2028-02-29', '2028-03-30']);
  });

  it('brings a yearly Feb 29 bill back to Feb 29', () => {
    expect(
      dueDates(repeat('year', 1, '2024-02-29'), date('2024-01-01'), date('2028-12-31')),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('counts weeks in days', () => {
    expect(
      dueDates(repeat('week', 2, '2026-12-25'), date('2026-12-01'), date('2027-01-31')),
    ).toEqual(['2026-12-25', '2027-01-08', '2027-01-22']);
  });

  it('handles quarterly, and stops at the last date', () => {
    expect(
      dueDates(
        repeat('month', 3, '2026-01-15', '2026-10-15'),
        date('2026-01-01'),
        date('2027-12-31'),
      ),
    ).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  });

  it('has exactly one date for a bill due once', () => {
    const once: Schedule = { kind: 'once', firstDue: date('2026-05-05') };
    expect(dueDates(once, date('2026-01-01'), date('2026-12-31'))).toEqual(['2026-05-05']);
    expect(dueDates(once, date('2026-05-06'), date('2026-12-31'))).toEqual([]);
  });

  it('includes both ends of the range, and nothing before the first date', () => {
    const monthly = repeat('month', 1, '2026-03-10');
    expect(dueDates(monthly, date('2026-01-01'), date('2026-04-10'))).toEqual([
      '2026-03-10',
      '2026-04-10',
    ]);
    expect(dueDates(monthly, date('2026-04-10'), date('2026-04-10'))).toEqual(['2026-04-10']);
  });

  it('starts late into a long-running weekly bill without counting from the start', () => {
    const weekly = repeat('week', 1, '1990-01-01');
    expect(dueDates(weekly, date('2026-06-01'), date('2026-06-14'))).toEqual([
      '2026-06-01',
      '2026-06-08',
    ]);
  });

  it('match counting from the first date, for any schedule and range', () => {
    fc.assert(
      fc.property(anySchedule, anyRange, (schedule, [from, to]) => {
        expect(dueDates(schedule, from, to)).toEqual(slowDueDates(schedule, from, to));
      }),
    );
  });

  it('are in order, inside the range, never repeated, and never after the last date', () => {
    fc.assert(
      fc.property(anySchedule, anyRange, (schedule, [from, to]) => {
        const dates = dueDates(schedule, from, to);
        for (const [index, due] of dates.entries()) {
          expect(compareDates(due, from)).toBeGreaterThanOrEqual(0);
          expect(compareDates(due, to)).toBeLessThanOrEqual(0);
          expect(compareDates(due, schedule.firstDue)).toBeGreaterThanOrEqual(0);
          if (schedule.kind === 'repeat' && schedule.lastDue) {
            expect(compareDates(due, schedule.lastDue)).toBeLessThanOrEqual(0);
          }
          const next = dates[index + 1];
          if (next) expect(compareDates(due, next)).toBeLessThan(0);
        }
      }),
    );
  });

  it('are the same whether a range is listed at once or in two parts', () => {
    // The daily job extends occurrences a day at a time, so this has to hold.
    fc.assert(
      fc.property(anySchedule, anyRange, fc.nat(800), (schedule, [from, to], cut) => {
        const middle = addDays(from, Math.min(cut, daysBetween(from, to)));
        const whole = dueDates(schedule, from, to);
        const parts = [
          ...dueDates(schedule, from, middle),
          ...dueDates(schedule, addDays(middle, 1), to),
        ];
        expect(parts).toEqual(whole);
      }),
    );
  });

  it('keep the first date’s day of the month, or the month’s last day', () => {
    fc.assert(
      fc.property(
        anyDate,
        fc.integer({ min: 1, max: 12 }),
        anyRange,
        (first, every, [from, to]) => {
          const wanted = datePartsOf(first).day;
          for (const due of dueDates(repeat('month', every, first), from, to)) {
            const { year, month, day } = datePartsOf(due);
            const lastDay = [31, 30, 29, 28].find((d) => dateFromParts(year, month, d)) ?? 28;
            expect(day).toBe(Math.min(wanted, lastDay));
          }
        },
      ),
    );
  });

  it('are exactly N weeks apart for a weekly bill', () => {
    fc.assert(
      fc.property(
        anyDate,
        fc.integer({ min: 1, max: 12 }),
        anyRange,
        (first, every, [from, to]) => {
          const dates = dueDates(repeat('week', every, first), from, to);
          for (const [index, due] of dates.slice(1).entries()) {
            expect(daysBetween(dates[index] ?? due, due)).toBe(7 * every);
          }
        },
      ),
    );
  });
});

describe('checking a schedule', () => {
  it.each([0, -1, 1.5, MAX_EVERY + 1])('refuses every %s', (every) => {
    expect(scheduleProblem(repeat('month', every, '2026-01-01'))).toMatch(/from 1 to 99/);
  });

  it('refuses a last date before the first', () => {
    expect(scheduleProblem(repeat('month', 1, '2026-02-01', '2026-01-31'))).toMatch(/before/);
  });

  it('accepts a sensible schedule, and any bill due once', () => {
    expect(scheduleProblem(repeat('month', 1, '2026-01-01', '2026-01-01'))).toBeNull();
    expect(scheduleProblem({ kind: 'once', firstDue: date('2026-01-01') })).toBeNull();
  });
});

describe('a schedule in words', () => {
  it.each([
    [repeat('month', 1, '2026-01-15'), 'Monthly on the 15th'],
    [repeat('month', 1, '2026-01-01'), 'Monthly on the 1st'],
    [repeat('month', 1, '2026-01-02'), 'Monthly on the 2nd'],
    [repeat('month', 1, '2026-01-03'), 'Monthly on the 3rd'],
    [repeat('month', 1, '2026-01-11'), 'Monthly on the 11th'],
    [repeat('month', 1, '2026-01-12'), 'Monthly on the 12th'],
    [repeat('month', 1, '2026-01-13'), 'Monthly on the 13th'],
    [repeat('month', 1, '2026-01-22'), 'Monthly on the 22nd'],
    [repeat('month', 1, '2026-01-31'), 'Monthly on the last day'],
    [repeat('month', 1, '2026-01-30'), 'Monthly on the 30th, or the last day of shorter months'],
    [repeat('month', 3, '2026-01-15'), 'Every 3 months on the 15th'],
    [repeat('week', 1, '2026-11-09'), 'Weekly on Monday'],
    [repeat('week', 2, '2026-11-13'), 'Every 2 weeks on Friday'],
    [repeat('week', 1, '2026-11-15'), 'Weekly on Sunday'],
    [repeat('year', 1, '2026-03-04'), 'Yearly on March 4'],
    [repeat('year', 2, '2028-02-29'), 'Every 2 years on February 29, or Feb 28 in other years'],
    [repeat('month', 1, '2026-01-15', '2026-12-15'), 'Monthly on the 15th, until Dec 15, 2026'],
    [once('2026-03-04'), 'Once, on Mar 4, 2026'],
  ])('%#: %s', (schedule, words) => {
    expect(describeSchedule(schedule)).toBe(words);
  });

  it('names the right weekday for dates before 1970', () => {
    expect(describeSchedule(repeat('week', 1, '1969-12-31'))).toBe('Weekly on Wednesday');
  });
});
