import {
  addMonthsFromAnchor,
  compareDates,
  dateFromParts,
  datePartsOf,
  dueDates,
  today,
  type CalendarDate,
  type Schedule,
} from '@remidy/domain';

/** How far ahead due dates exist, so that a yearly bill always shows. */
export const MONTHS_AHEAD = 13;

const later = (a: CalendarDate, b: CalendarDate) => (compareDates(a, b) >= 0 ? a : b);

function monthStart(date: CalendarDate): CalendarDate {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
}

/** Due dates from `from` to the horizon, which is 13 months after today in the space. */
function upTo13MonthsAhead(schedule: Schedule, from: CalendarDate, now: CalendarDate) {
  return dueDates(schedule, later(schedule.firstDue, from), addMonthsFromAnchor(now, MONTHS_AHEAD));
}

/**
 * A new bill's due dates. They start at the beginning of this month, so a date earlier this month
 * still shows as overdue, but a bill started years ago doesn't arrive with years of them.
 */
export function firstDueDates(schedule: Schedule, timeZone: string): CalendarDate[] {
  const now = today(timeZone);
  return upTo13MonthsAhead(schedule, monthStart(now), now);
}

/**
 * Due dates from today on. Used after an edit, and by the job that keeps due dates 13 months
 * ahead. Earlier dates are never added again, so the past isn't rewritten.
 */
export function futureDueDates(schedule: Schedule, timeZone: string): CalendarDate[] {
  const now = today(timeZone);
  return upTo13MonthsAhead(schedule, now, now);
}
