import { datePartsOf, formatDate, monthEnd, type CalendarDate } from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn, focusRing } from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda } from '../api.ts';
import { firstOfMonth, gridDays, sameMonth, WEEKDAYS } from './calendarGrid.ts';
import { DAY_STATUS, mostUrgent } from './dayStatus.ts';

interface MiniCalendarProps {
  today: CalendarDate;
}

/**
 * This month at a glance, beside Home's summary: a mark on each day with bills, showing the one
 * that matters most. Choosing a day opens it on the Calendar page.
 */
export function MiniCalendar({ today }: MiniCalendarProps) {
  const month = firstOfMonth(today);
  const to = monthEnd(month);
  // The same request as the Calendar page's for this month, so it's shared.
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, month, to],
    queryFn: ({ signal }) => fetchAgenda(month, to, signal),
  });
  const entries = agenda.data
    ? [...agenda.data.overdue, ...agenda.data.upcoming].filter((entry) => entry.dueOn >= month)
    : [];
  const title = formatDate(month, 'monthYear');
  return (
    <section
      aria-labelledby="mini-calendar"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="mini-calendar" className="text-lg font-semibold">
          {title}
        </h2>
        <Link
          to="/calendar"
          className={cn('rounded-md text-sm font-semibold text-accent-text underline', focusRing)}
        >
          Calendar
        </Link>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 text-center text-xs text-ink-2">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name.charAt(0)}</span>
        ))}
      </div>
      <ol aria-label={title} className="grid grid-cols-7 gap-y-1 text-center">
        {gridDays(month).map((day) => {
          if (!sameMonth(day, month)) return <li key={day} aria-hidden="true" />;
          const onDay = entries.filter((entry) => entry.dueOn === day);
          const urgent = mostUrgent(onDay, today);
          const label = [
            formatDate(day, 'long'),
            day === today ? 'today' : null,
            urgent
              ? `${String(onDay.length)} due, ${DAY_STATUS[urgent].label.toLowerCase()}`
              : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <li key={day}>
              <Link
                to="/calendar"
                search={{ day }}
                aria-label={label}
                className={cn(
                  'mx-auto flex size-9 flex-col items-center justify-center rounded-full text-sm tabular-nums hover:bg-surface-2',
                  day === today && 'bg-accent font-semibold text-on-accent hover:bg-accent',
                  focusRing,
                )}
              >
                {datePartsOf(day).day}
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    urgent ? DAY_STATUS[urgent].dot : 'bg-transparent',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
