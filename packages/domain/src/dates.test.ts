import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsFromAnchor,
  compareDates,
  dateFromParts,
  dateInputValue,
  datePartsOf,
  dayOfWeek,
  daysBetween,
  formatDate,
  formatInstant,
  isValidTimeZone,
  monthEnd,
  parseCalendarDate,
  parseTypedDate,
  today,
  type CalendarDate,
} from './dates.ts';

const date = (text: string): CalendarDate => {
  const parsed = parseCalendarDate(text);
  if (!parsed) throw new Error(`Bad test date: ${text}`);
  return parsed;
};

const anyDate = fc
  .record({
    year: fc.integer({ min: 1970, max: 2100 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) =>
    date(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`),
  );

describe('parseCalendarDate', () => {
  it.each(['2026-11-09', '2024-02-29', '2026-01-01', '2026-12-31'])('accepts %s', (text) => {
    expect(parseCalendarDate(text)).toBe(text);
  });

  it.each([
    ['2026-02-29'],
    ['2026-13-01'],
    ['2026-00-10'],
    ['2026-04-31'],
    ['2026-11-9'],
    ['11/09/2026'],
    ['2026-11-09T00:00:00Z'],
    ['2026-11-09 '],
    [''],
    ['not a date'],
  ])('rejects %j', (text) => {
    expect(parseCalendarDate(text)).toBeNull();
  });
});

describe('today', () => {
  const INSTANT = '2026-11-07T03:30:00Z';

  it.each([
    ['UTC', '2026-11-07'],
    ['America/Chicago', '2026-11-06'],
    ['America/New_York', '2026-11-06'],
    ['Asia/Tokyo', '2026-11-07'],
    ['Pacific/Kiritimati', '2026-11-07'],
    ['Pacific/Pago_Pago', '2026-11-06'],
  ])('in %s is %s', (timeZone, expected) => {
    expect(today(timeZone, INSTANT)).toBe(expected);
  });

  it('changes at local midnight, not at UTC midnight', () => {
    expect(today('America/Chicago', '2026-11-07T05:59:59Z')).toBe('2026-11-06');
    expect(today('America/Chicago', '2026-11-07T06:00:00Z')).toBe('2026-11-07');
  });

  it('handles the daylight saving changes', () => {
    // 2026-03-08: Chicago skips 2:00 to 3:00, so its offset moves from -6 to -5.
    expect(today('America/Chicago', '2026-03-08T05:59:59Z')).toBe('2026-03-07');
    expect(today('America/Chicago', '2026-03-09T04:59:59Z')).toBe('2026-03-08');
    expect(today('America/Chicago', '2026-03-09T05:00:00Z')).toBe('2026-03-09');
  });

  it('uses the current moment by default', () => {
    expect(parseCalendarDate(today('UTC'))).not.toBeNull();
  });
});

describe('isValidTimeZone', () => {
  it('knows real time zones', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-11-09', 1, '2026-11-10'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    // A daylight saving change must not move a date.
    ['2026-03-07', 1, '2026-03-08'],
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-11-01', 1, '2026-11-02'],
  ])('%s plus %i is %s', (start, days, expected) => {
    expect(addDays(date(start), days)).toBe(expected);
  });
});

describe('addMonthsFromAnchor', () => {
  it('keeps the original day after a short month', () => {
    const anchor = date('2026-01-31');
    const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) =>
      addMonthsFromAnchor(anchor, n),
    );
    expect(months).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  it('uses Feb 29 in a leap year', () => {
    expect(addMonthsFromAnchor(date('2024-01-31'), 1)).toBe('2024-02-29');
    expect(addMonthsFromAnchor(date('2024-02-29'), 12)).toBe('2025-02-28');
    expect(addMonthsFromAnchor(date('2024-02-29'), 48)).toBe('2028-02-29');
  });

  it('always lands in the right month, never earlier than the anchor day allows', () => {
    const anyDay = fc
      .record({
        year: fc.integer({ min: 1970, max: 2100 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 31 }),
      })
      .map(({ year, month, day }) =>
        parseCalendarDate(
          `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        ),
      )
      .filter((value): value is CalendarDate => value !== null);

    fc.assert(
      fc.property(anyDay, fc.integer({ min: 0, max: 600 }), (anchor, months) => {
        const [year, month, day] = anchor.split('-').map(Number) as [number, number, number];
        const totalMonths = year * 12 + (month - 1) + months;
        const result = addMonthsFromAnchor(anchor, months);
        const [resultYear, resultMonth, resultDay] = result.split('-').map(Number) as [
          number,
          number,
          number,
        ];

        expect(resultYear * 12 + (resultMonth - 1)).toBe(totalMonths);
        // The day only ever moves down, and only because the month is too short.
        expect(resultDay).toBeLessThanOrEqual(day);
        if (resultDay < day) {
          expect(addDays(result, 1).split('-')[2]).toBe('01');
        }
      }),
    );
  });
});

describe('compareDates and daysBetween', () => {
  it('orders dates', () => {
    expect(compareDates(date('2026-01-01'), date('2026-01-02'))).toBeLessThan(0);
    expect(compareDates(date('2026-01-02'), date('2026-01-01'))).toBeGreaterThan(0);
    expect(compareDates(date('2026-01-01'), date('2026-01-01'))).toBe(0);
  });

  it('counts days across months and leap days', () => {
    expect(daysBetween(date('2026-11-06'), date('2026-11-09'))).toBe(3);
    expect(daysBetween(date('2026-11-09'), date('2026-11-06'))).toBe(-3);
    expect(daysBetween(date('2024-02-28'), date('2024-03-01'))).toBe(2);
    expect(daysBetween(date('2026-01-01'), date('2027-01-01'))).toBe(365);
  });

  it('agrees with addDays', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: -5000, max: 5000 }), (start, days) => {
        const end = addDays(start, days);
        expect(daysBetween(start, end)).toBe(days);
        expect(Math.sign(compareDates(end, start))).toBe(Math.sign(days));
      }),
    );
  });
});

describe('weekdays and month ends', () => {
  it.each([
    ['2026-11-08', 0],
    ['2026-11-09', 1],
    ['2026-11-14', 6],
    ['1969-12-31', 3],
  ])('%s is day %i of the week, counting Sunday as 0', (text, day) => {
    expect(dayOfWeek(date(text))).toBe(day);
  });

  it.each([
    ['2026-02-10', '2026-02-28'],
    ['2028-02-01', '2028-02-29'],
    ['2026-12-31', '2026-12-31'],
    ['2026-04-15', '2026-04-30'],
  ])('the month of %s ends on %s', (text, end) => {
    expect(monthEnd(date(text))).toBe(end);
  });
});

describe('formatDate', () => {
  it.each([
    ['medium', 'Nov 9, 2026'],
    ['short', 'Mon, Nov 9'],
    ['long', 'Monday, November 9'],
    ['weekday', 'Monday'],
    ['monthDay', 'November 9'],
    ['monthYear', 'November 2026'],
  ] as const)('%s style', (style, expected) => {
    expect(formatDate(date('2026-11-09'), style)).toBe(expected);
  });

  it('defaults to the medium style', () => {
    expect(formatDate(date('2026-11-09'))).toBe('Nov 9, 2026');
  });

  it('shows the same day whatever the time zone of the computer', () => {
    // A date stored as midnight UTC would show as Dec 31 in the Americas.
    expect(formatDate(date('2027-01-01'))).toBe('Jan 1, 2027');
  });
});

describe('formatInstant', () => {
  it.each([
    ['America/Chicago', 'Jan 5, 2026, 2:30 PM'],
    ['Asia/Tokyo', 'Jan 6, 2026, 5:30 AM'],
    ['UTC', 'Jan 5, 2026, 8:30 PM'],
  ])('shows the local time in %s', (timeZone, expected) => {
    expect(formatInstant('2026-01-05T20:30:00.000Z', timeZone).replace(/\s/g, ' ')).toBe(expected);
  });
});

describe('parseTypedDate', () => {
  it.each([
    ['3/8/2026', '2026-03-08'],
    ['03/08/2026', '2026-03-08'],
    ['3/8/26', '2026-03-08'],
    ['12/31/99', '2099-12-31'],
    ['1/1/00', '2000-01-01'],
    ['3-8-2026', '2026-03-08'],
    ['3.8.2026', '2026-03-08'],
    ['2026-03-08', '2026-03-08'],
    ['  3/8/2026  ', '2026-03-08'],
    ['3/8', '2030-03-08'],
    ['2/29/2028', '2028-02-29'],
  ])('reads %s', (typed, expected) => {
    expect(parseTypedDate(typed, 2030)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['3'],
    ['3/'],
    ['3/8/'],
    ['3/8/2'],
    ['3/8/202'],
    ['3/8/20266'],
    ['13/1/2026'],
    ['0/1/2026'],
    ['2/30/2026'],
    ['2/29/2026'],
    ['2026-3-8'],
    ['2026-02-30'],
    ['3/8/2026 5pm'],
    ['-3/8/2026'],
  ])('refuses %j', (typed) => {
    expect(parseTypedDate(typed, 2026)).toBeNull();
  });

  it('refuses a day that does not exist in this year', () => {
    expect(parseTypedDate('2/29', 2026)).toBeNull();
    expect(parseTypedDate('2/29', 2028)).toBe('2028-02-29');
  });
});

describe('dateInputValue', () => {
  it('has no leading zeros, and reads back as the same date', () => {
    const date = dateFromParts(2026, 3, 8);
    if (!date) throw new Error('Not a date.');
    expect(dateInputValue(date)).toBe('3/8/2026');
    expect(parseTypedDate(dateInputValue(date), 1999)).toBe(date);
  });
});

describe('date parts', () => {
  it('go both ways', () => {
    const date = dateFromParts(2026, 12, 1);
    expect(date).toBe('2026-12-01');
    if (!date) throw new Error('Not a date.');
    expect(datePartsOf(date)).toEqual({ year: 2026, month: 12, day: 1 });
  });

  it('refuse a day that does not exist', () => {
    expect(dateFromParts(2026, 2, 30)).toBeNull();
  });
});
