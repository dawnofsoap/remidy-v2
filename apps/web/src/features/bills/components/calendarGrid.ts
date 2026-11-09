import {
  addDays,
  dateFromParts,
  datePartsOf,
  dayOfWeek,
  monthEnd,
  today,
  type CalendarDate,
} from '@remidy/domain';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);

export function firstOfMonth(date: CalendarDate): CalendarDate {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
}

/** Every day shown in a month's grid: whole weeks, Sunday to Saturday. */
export function gridDays(month: CalendarDate): CalendarDate[] {
  const start = addDays(month, -dayOfWeek(month));
  const last = monthEnd(month);
  const end = addDays(last, 6 - dayOfWeek(last));
  const days: CalendarDate[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export const sameMonth = (a: CalendarDate, b: CalendarDate) => a.slice(0, 7) === b.slice(0, 7);
