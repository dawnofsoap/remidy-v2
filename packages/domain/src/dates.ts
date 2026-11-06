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
} as const;

export function formatDate(date: CalendarDate, style: keyof typeof FORMATS = 'medium'): string {
  return plain(date).toLocaleString('en-US', FORMATS[style]);
}
