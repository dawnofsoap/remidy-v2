import {
  addDays,
  addMonthsFromAnchor,
  compareDates,
  datePartsOf,
  daysBetween,
  formatDate,
  type CalendarDate,
} from './dates.ts';

export type RepeatUnit = 'week' | 'month' | 'year';

/** The largest "every N" a schedule accepts, which is far beyond any real bill. */
export const MAX_EVERY = 99;

/**
 * When a bill is due: once, or every N weeks, months or years from its first due date, until an
 * optional last date. Every due date is counted from the first one, so a bill due on the 31st comes
 * back to the 31st after a shorter month instead of drifting earlier.
 */
export type Schedule =
  | { kind: 'once'; firstDue: CalendarDate }
  | {
      kind: 'repeat';
      unit: RepeatUnit;
      every: number;
      firstDue: CalendarDate;
      lastDue: CalendarDate | null;
    };

/** The Nth due date, counting the first as 0. */
function nthDue(schedule: Extract<Schedule, { kind: 'repeat' }>, n: number): CalendarDate {
  const { unit, every, firstDue } = schedule;
  if (unit === 'week') return addDays(firstDue, 7 * every * n);
  return addMonthsFromAnchor(firstDue, (unit === 'year' ? 12 : 1) * every * n);
}

/** A count of due dates that's sure to be at or before `from`, so listing can skip ahead. */
function firstCountNear(schedule: Extract<Schedule, { kind: 'repeat' }>, from: CalendarDate) {
  const { unit, every, firstDue } = schedule;
  if (compareDates(from, firstDue) <= 0) return 0;
  if (unit === 'week') return Math.floor(daysBetween(firstDue, from) / (7 * every));
  const start = datePartsOf(firstDue);
  const end = datePartsOf(from);
  const months = (end.year - start.year) * 12 + (end.month - start.month);
  // That many steps lands in the same month as `from` or earlier, so no date on or after it is skipped.
  return Math.floor(months / ((unit === 'year' ? 12 : 1) * every));
}

/** Every due date from `from` to `to`, both included, in order. */
export function dueDates(schedule: Schedule, from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const inRange = (date: CalendarDate) =>
    compareDates(date, from) >= 0 && compareDates(date, to) <= 0;
  if (schedule.kind === 'once') return inRange(schedule.firstDue) ? [schedule.firstDue] : [];

  const last = schedule.lastDue && compareDates(schedule.lastDue, to) < 0 ? schedule.lastDue : to;
  const dates: CalendarDate[] = [];
  for (let n = firstCountNear(schedule, from); ; n += 1) {
    const date = nthDue(schedule, n);
    if (compareDates(date, last) > 0) break;
    if (compareDates(date, from) >= 0) dates.push(date);
  }
  return dates;
}

/** Why a schedule can't be used, or null when it can. Written to show the person. */
export function scheduleProblem(schedule: Schedule): string | null {
  if (schedule.kind === 'once') return null;
  if (!Number.isInteger(schedule.every) || schedule.every < 1 || schedule.every > MAX_EVERY) {
    return `Choose a number from 1 to ${String(MAX_EVERY)}.`;
  }
  if (schedule.lastDue && compareDates(schedule.lastDue, schedule.firstDue) < 0) {
    return 'The last date can’t be before the first.';
  }
  return null;
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${String(day)}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
  return `${String(day)}${suffix}`;
}

function dayOfMonth(day: number): string {
  if (day === 31) return 'on the last day';
  if (day >= 29) return `on the ${ordinal(day)}, or the last day of shorter months`;
  return `on the ${ordinal(day)}`;
}

/** The schedule in words, such as "Monthly on the 15th" or "Every 2 weeks on Friday". */
export function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === 'once') return `Once, on ${formatDate(schedule.firstDue)}`;
  const { unit, every, firstDue, lastDue } = schedule;
  const { month, day } = datePartsOf(firstDue);
  const ending = lastDue ? `, until ${formatDate(lastDue)}` : '';

  if (unit === 'week') {
    const how = every === 1 ? 'Weekly' : `Every ${String(every)} weeks`;
    return `${how} on ${formatDate(firstDue, 'weekday')}${ending}`;
  }
  if (unit === 'month') {
    const how = every === 1 ? 'Monthly' : `Every ${String(every)} months`;
    return `${how} ${dayOfMonth(day)}${ending}`;
  }
  const how = every === 1 ? 'Yearly' : `Every ${String(every)} years`;
  const leapDay = month === 2 && day === 29 ? ', or Feb 28 in other years' : '';
  return `${how} on ${formatDate(firstDue, 'monthDay')}${leapDay}${ending}`;
}
