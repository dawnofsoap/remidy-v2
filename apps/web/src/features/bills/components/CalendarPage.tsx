import type { AgendaEntry } from '@remidy/contracts';
import {
  addMonthsFromAnchor,
  datePartsOf,
  formatDate,
  monthEnd,
  parseCalendarDate,
  type CalendarDate,
} from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Page } from '../../../core/Page.tsx';
import {
  Button,
  cn,
  ErrorState,
  List,
  ListRow,
  LoadingState,
  LogoTile,
} from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda, logoUrl } from '../api.ts';
import { useRefresh } from '../useRefresh.ts';
import { browserToday, firstOfMonth, gridDays, sameMonth, WEEKDAYS } from './calendarGrid.ts';
import { DaySheet } from './DaySheet.tsx';
import { byUrgency, DAY_STATUS, dayStatusOf } from './dayStatus.ts';
import { statusOf } from './dueStatus.ts';
import { PaySheet } from './PaySheet.tsx';

/** In rem, matching the classes below: a day's padding, its date, and each line under it. */
const DAY_PADDING = 0.75;
const DAY_NUMBER = 2;
const LINE = 1.75;

/**
 * How many lines fit under a day's date, from the height the grid gives each day. Days fill the
 * window, so a taller screen shows more bills before "+N more".
 */
function useLinesPerDay(grid: RefObject<HTMLElement | null>): number {
  const [lines, setLines] = useState(3);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const day = element.firstElementChild;
      if (!(day instanceof HTMLElement)) return;
      // The root size in pixels, which grows on very wide screens.
      const rem = Number(getComputedStyle(document.documentElement).fontSize.replace('px', ''));
      const room = day.clientHeight / rem - DAY_PADDING - DAY_NUMBER;
      setLines(Math.max(1, Math.floor(room / LINE)));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  });
  return lines;
}

/** The day in the address, such as /calendar?day=2026-11-20 from Home's small calendar. */
function useDayInAddress(): CalendarDate | null {
  const search: unknown = useSearch({ strict: false });
  const day =
    typeof search === 'object' && search !== null ? (search as { day?: unknown }).day : null;
  return typeof day === 'string' ? parseCalendarDate(day) : null;
}

/** One bill on a day in the grid: its logo, name and status. */
function DayChip({
  entry,
  now,
  onOpen,
}: {
  entry: AgendaEntry;
  now: CalendarDate;
  onOpen: () => void;
}) {
  const status = DAY_STATUS[dayStatusOf(entry, now)];
  const Icon = status.icon;
  return (
    <Button
      variant="ghost"
      size="small"
      className={cn('w-full justify-start gap-1.5 px-1.5', status.chip)}
      title={`${entry.name}: ${status.label}, ${statusOf(entry, false).text}`}
      onClick={onOpen}
    >
      <LogoTile size="small" src={logoUrl(entry.logoId)} name={entry.name} />
      <span className="min-w-0 flex-auto truncate text-left">{entry.name}</span>
      {Icon ? <Icon aria-hidden="true" className="size-4 flex-none" /> : null}
      <span className="sr-only">, {status.label}</span>
    </Button>
  );
}

/** Due dates and what's been paid, a month at a time, with each bill's logo and status. */
export function CalendarPage() {
  const now = browserToday();
  const dayInAddress = useDayInAddress();
  const [month, setMonth] = useState(firstOfMonth(dayInAddress ?? now));
  const [openDay, setOpenDay] = useState<CalendarDate | null>(dayInAddress);
  const to = monthEnd(month);
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, month, to],
    queryFn: ({ signal }) => fetchAgenda(month, to, signal),
  });
  const [paying, setPaying] = useState<AgendaEntry | null>(null);
  const grid = useRef<HTMLOListElement>(null);
  const linesPerDay = useLinesPerDay(grid);
  const refresh = useRefresh();

  const entries = agenda.data
    ? [...agenda.data.overdue, ...agenda.data.upcoming].filter(
        (entry) => entry.dueOn >= month && entry.dueOn <= to,
      )
    : [];
  const onDay = (day: CalendarDate) =>
    byUrgency(
      entries.filter((entry) => entry.dueOn === day),
      now,
    );
  const showMonth = (next: CalendarDate) => {
    setMonth(next);
  };

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        aria-label="Previous month"
        onClick={() => {
          showMonth(addMonthsFromAnchor(month, -1));
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
          showMonth(addMonthsFromAnchor(month, 1));
        }}
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </Button>
      {month !== firstOfMonth(now) ? (
        <Button
          variant="ghost"
          onClick={() => {
            showMonth(firstOfMonth(now));
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
    const daysWithBills = [
      ...new Set(entries.map((entry) => entry.dueOn)),
    ].sort() as CalendarDate[];
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
              ref={grid}
              // The weeks share the window's height below the page's header, and never get shorter
              // than 8rem.
              className="grid min-h-[calc(100dvh-13rem)] auto-rows-[minmax(8rem,1fr)] grid-cols-7 gap-px bg-line"
            >
              {gridDays(month).map((day) => {
                const items = onDay(day);
                const inMonth = sameMonth(day, month);
                const count = items.length;
                // Every bill when they all fit, or one line fewer to make room for "+N more".
                const shown = count <= linesPerDay ? count : linesPerDay - 1;
                return (
                  <li
                    key={day}
                    className={cn(
                      'flex min-w-0 flex-col gap-1 overflow-hidden bg-surface p-1.5',
                      !inMonth && 'bg-bg text-ink-2',
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="small"
                      className={cn(
                        'size-8 self-start rounded-full p-0 tabular-nums',
                        day === now && 'bg-accent font-semibold text-on-accent',
                      )}
                      aria-label={`${formatDate(day, 'long')}${count > 0 ? `, ${String(count)} due` : ''}`}
                      onClick={() => {
                        setOpenDay(day);
                      }}
                    >
                      {datePartsOf(day).day}
                    </Button>
                    {items.slice(0, shown).map((entry) => (
                      <DayChip
                        key={entry.id}
                        entry={entry}
                        now={now}
                        onOpen={() => {
                          setPaying(entry);
                        }}
                      />
                    ))}
                    {count > shown ? (
                      <Button
                        variant="ghost"
                        size="small"
                        className="justify-start px-1.5 text-ink-2"
                        onClick={() => {
                          setOpenDay(day);
                        }}
                      >
                        +{count - shown} more
                        <span className="sr-only"> on {formatDate(day, 'long')}</span>
                      </Button>
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
              <h3 className={cn('font-semibold', day === now && 'text-accent-text')}>
                {formatDate(day, 'long')}
                {day === now ? ' · Today' : ''}
              </h3>
              <List label={formatDate(day, 'long')}>
                {onDay(day).map((entry) => {
                  const status = DAY_STATUS[dayStatusOf(entry, now)];
                  return (
                    <ListRow
                      key={entry.id}
                      title={entry.name}
                      subtitle={status.label}
                      start={<LogoTile src={logoUrl(entry.logoId)} name={entry.name} />}
                      end={
                        <span className={cn('font-semibold tabular-nums', status.text)}>
                          {statusOf(entry, false).text}
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
      {openDay && !paying ? (
        <DaySheet
          day={openDay}
          entries={entries.filter((entry) => entry.dueOn === openDay)}
          today={now}
          onClose={() => {
            setOpenDay(null);
          }}
          onOpen={(entry) => {
            setPaying(entry);
          }}
        />
      ) : null}
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
