import type { AgendaEntry } from '@remidy/contracts';
import {
  addDays,
  addMonthsFromAnchor,
  dateFromParts,
  datePartsOf,
  dayOfWeek,
  formatDate,
  monthEnd,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../../core/Page.tsx';
import { Button, cn, ErrorState, List, ListRow, LoadingState } from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda } from '../api.ts';
import { useRefresh } from '../useRefresh.ts';
import { statusOf } from './dueStatus.ts';
import { PaySheet } from './PaySheet.tsx';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHOWN_PER_DAY = 3;

const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);

function firstOfMonth(date: CalendarDate): CalendarDate {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
}

/** Every day shown in the month's grid: whole weeks, Sunday to Saturday. */
function gridDays(month: CalendarDate): CalendarDate[] {
  const start = addDays(month, -dayOfWeek(month));
  const last = monthEnd(month);
  const end = addDays(last, 6 - dayOfWeek(last));
  const days: CalendarDate[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Due dates and what's been paid, a month at a time. */
export function CalendarPage() {
  const now = browserToday();
  const [month, setMonth] = useState(firstOfMonth(now));
  const to = monthEnd(month);
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, month, to],
    queryFn: ({ signal }) => fetchAgenda(month, to, signal),
  });
  const [paying, setPaying] = useState<AgendaEntry | null>(null);
  const refresh = useRefresh();

  const entries = agenda.data
    ? [...agenda.data.overdue, ...agenda.data.upcoming].filter(
        (entry) => entry.dueOn >= month && entry.dueOn <= to,
      )
    : [];
  const onDay = (day: CalendarDate) => entries.filter((entry) => entry.dueOn === day);
  const isOverdue = (entry: AgendaEntry) => entry.state === 'open' && entry.dueOn < now;

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        aria-label="Previous month"
        onClick={() => {
          setMonth(addMonthsFromAnchor(month, -1));
        }}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Button>
      <h2 className="min-w-44 text-center text-lg font-semibold" aria-live="polite">
        {formatDate(month, 'monthYear')}
      </h2>
      <Button
        variant="secondary"
        aria-label="Next month"
        onClick={() => {
          setMonth(addMonthsFromAnchor(month, 1));
        }}
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </Button>
      {month !== firstOfMonth(now) ? (
        <Button
          variant="ghost"
          onClick={() => {
            setMonth(firstOfMonth(now));
          }}
        >
          This month
        </Button>
      ) : null}
    </div>
  );

  let body;
  if (agenda.isPending) body = <LoadingState label="Loading the calendar" />;
  else if (agenda.isError) {
    body = (
      <ErrorState message="The calendar couldn’t load." onRetry={() => void agenda.refetch()} />
    );
  } else {
    const daysWithBills = [...new Set(entries.map((entry) => entry.dueOn))].sort();
    body = (
      <>
        {/* A month grid where there's room for one. */}
        <div className="hidden md:block">
          <div className="overflow-hidden rounded-2xl border border-line">
            {/* Each day reads its full date, so the weekday row is for sight only. */}
            <div
              aria-hidden="true"
              className="grid grid-cols-7 border-b border-line bg-surface text-sm text-ink-2"
            >
              {WEEKDAYS.map((name) => (
                <div key={name} className="px-2 py-2 font-semibold">
                  {name}
                </div>
              ))}
            </div>
            <ol
              aria-label={formatDate(month, 'monthYear')}
              className="grid grid-cols-7 gap-px bg-line"
            >
              {gridDays(month).map((day) => {
                const items = onDay(day);
                const inMonth = day.slice(0, 7) === month.slice(0, 7);
                return (
                  <li
                    key={day}
                    className={cn(
                      'flex min-h-28 flex-col gap-1 bg-surface p-1.5',
                      !inMonth && 'bg-bg text-ink-2',
                    )}
                  >
                    <span
                      className={cn(
                        'self-start rounded-full px-1.5 text-sm tabular-nums',
                        day === now && 'bg-accent font-semibold text-on-accent',
                      )}
                    >
                      <span aria-hidden="true">{datePartsOf(day).day}</span>
                      <span className="sr-only">{formatDate(day, 'long')}</span>
                    </span>
                    {items.slice(0, SHOWN_PER_DAY).map((entry) => {
                      const status = statusOf(entry, isOverdue(entry));
                      return (
                        <Button
                          key={entry.id}
                          variant="ghost"
                          size="small"
                          className={cn(
                            'w-full justify-between gap-1 truncate',
                            status.tone,
                            entry.state === 'skipped' && 'line-through',
                          )}
                          title={`${entry.name}: ${status.text}`}
                          onClick={() => {
                            setPaying(entry);
                          }}
                        >
                          <span className="truncate">{entry.name}</span>
                        </Button>
                      );
                    })}
                    {items.length > SHOWN_PER_DAY ? (
                      <span className="px-1.5 text-xs text-ink-2">
                        +{items.length - SHOWN_PER_DAY} more
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        {/* On phones, a grid is too cramped to read, so days with bills are listed instead. */}
        <div className="flex flex-col gap-4 md:hidden">
          {daysWithBills.length === 0 ? (
            <p className="text-ink-2">Nothing due this month.</p>
          ) : null}
          {daysWithBills.map((day) => (
            <section key={day} className="flex flex-col gap-2">
              <h3 className="font-semibold">{formatDate(day as CalendarDate, 'long')}</h3>
              <List label={formatDate(day as CalendarDate, 'long')}>
                {onDay(day as CalendarDate).map((entry) => {
                  const status = statusOf(entry, isOverdue(entry));
                  return (
                    <ListRow
                      key={entry.id}
                      title={entry.name}
                      end={
                        <span className={cn('font-semibold tabular-nums', status.tone)}>
                          {status.text}
                        </span>
                      }
                      onClick={() => {
                        setPaying(entry);
                      }}
                    />
                  );
                })}
              </List>
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <Page title="Calendar">
      {header}
      {body}
      {paying ? (
        <PaySheet
          entry={paying}
          onClose={() => {
            setPaying(null);
          }}
          onChanged={refresh}
        />
      ) : null}
    </Page>
  );
}
