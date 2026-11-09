import { Temporal } from 'temporal-polyfill';

/**
 * A due date is a day on the calendar, with no time or time zone: `2026-11-09`.
 * A bill due on the 9th is due on the 9th wherever you are, so it can't shift a day
 * the way v1's dates could. Time zones only matter when working out what "today" is.
 */
declare const calendarDateBrand: unique symbol;
export type CalendarDate = string & { readonly [calendarDateBrand]: true };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const plain = (date: CalendarDate) => Temporal.PlainDate.from(date);
const toCalendarDate = (date: Temporal.PlainDate) => date.toString() as CalendarDate;

/** Reads `YYYY-MM-DD`. Returns null for anything else, including days that don't exist. */
export function parseCalendarDate(text: string): CalendarDate | null {
  if (!DATE_PATTERN.test(text)) return null;
  try {
    return toCalendarDate(Temporal.PlainDate.from(text, { overflow: 'reject' }));
  } catch {
    return null;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function datePartsOf(date: CalendarDate): { year: number; month: number; day: number } {
  const { year, month, day } = plain(date);
  return { year, month, day };
}

/** Builds a date from its parts. Returns null for days that don't exist. */
export function dateFromParts(year: number, month: number, day: number): CalendarDate | null {
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return parseCalendarDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
}

// Month, day and an optional year, separated by /, - or a dot.
const TYPED_DATE = /^(?<month>\d{1,2})[/.-](?<day>\d{1,2})(?:[/.-](?<year>\d{4}|\d{2}))?$/;

/**
 * Reads a date a person typed, US style, filling in what's obvious: `3/8/26` is in 2026 and `3/8`
 * is in `thisYear`. It also takes `2026-03-08`. Returns null for anything else, including days that
 * don't exist, rather than guessing.
 */
export function parseTypedDate(text: string, thisYear: number): CalendarDate | null {
  const trimmed = text.trim();
  const exact = parseCalendarDate(trimmed);
  if (exact) return exact;

  const groups = TYPED_DATE.exec(trimmed)?.groups;
  if (!groups) return null;
  const typedYear = groups.year;
  let year = thisYear;
  if (typedYear) year = typedYear.length === 2 ? 2000 + Number(typedYear) : Number(typedYear);
  return dateFromParts(year, Number(groups.month), Number(groups.day));
}

/** For a form field, such as `3/8/2026`. `parseTypedDate` reads it back. */
export function dateInputValue(date: CalendarDate): string {
  const { year, month, day } = datePartsOf(date);
  return `${String(month)}/${String(day)}/${String(year)}`;
}

/** What today's date is in a time zone. `at` lets tests choose the moment. */
export function today(
  timeZone: string,
  at: string = Temporal.Now.instant().toString(),
): CalendarDate {
  return toCalendarDate(Temporal.Instant.from(at).toZonedDateTimeISO(timeZone).toPlainDate());
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return toCalendarDate(plain(date).add({ days }));
}

/**
 * The date a number of months after a starting date, ending on the last day of a shorter month.
 * Always count from the original date: from Jan 31, one month is Feb 28 and two months is Mar 31.
 * Counting from the previous result would get stuck on the 28th.
 */
export function addMonthsFromAnchor(anchor: CalendarDate, months: number): CalendarDate {
  return toCalendarDate(plain(anchor).add({ months }, { overflow: 'constrain' }));
}

/** Negative when `a` is earlier than `b`, zero when they match, and positive when later. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return Temporal.PlainDate.compare(plain(a), plain(b));
}

/** How many days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return plain(from).until(plain(to), { largestUnit: 'days' }).days;
}

const FORMATS = {
  /** Nov 9, 2026 */
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  /** Mon, Nov 9 */
  short: { weekday: 'short', month: 'short', day: 'numeric' },
  /** Monday, November 9 */
  long: { weekday: 'long', month: 'long', day: 'numeric' },
  /** Monday */
  weekday: { weekday: 'long' },
  /** March 4 */
  monthDay: { month: 'long', day: 'numeric' },
  /** November */
  month: { month: 'long' },
  /** November 2026 */
  monthYear: { month: 'long', year: 'numeric' },
} as const;

export function formatDate(date: CalendarDate, style: keyof typeof FORMATS = 'medium'): string {
  return plain(date).toLocaleString('en-US', FORMATS[style]);
}

/**
 * Shows a moment in time, such as when a job last ran, like `Jan 5, 2026, 2:30 PM`. This is for
 * things that happened at an instant. Due dates and other calendar dates use `formatDate`.
 */
export function formatInstant(iso: string, timeZone: string): string {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(timeZone)
    .toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** The day of the week, from 0 for Sunday to 6 for Saturday. */
export function dayOfWeek(date: CalendarDate): number {
  return plain(date).dayOfWeek % 7;
}

/** The last day of the month a date is in. */
export function monthEnd(date: CalendarDate): CalendarDate {
  const day = plain(date);
  return toCalendarDate(day.with({ day: day.daysInMonth }));
}
