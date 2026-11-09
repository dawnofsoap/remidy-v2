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
import { Check, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Page } from '../../../core/Page.tsx';
import { Button, cn, ErrorState, useIsNarrow, LoadingState, LogoTile } from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda, logoUrl } from '../api.ts';
import { browserToday, firstOfMonth, gridDays, sameMonth, WEEKDAYS } from './calendarGrid.ts';
import { DaySheet } from './DaySheet.tsx';
import { byUrgency, DAY_STATUS, dayStatusOf } from './dayStatus.ts';
import { statusOf } from './dueStatus.ts';
import { BillViewer } from './BillViewer.tsx';
import { PhoneMonth } from './PhoneMonth.tsx';

/** In rem, matching the classes below: a day's padding, its date, a gap, a name, and a logo. */
const DAY_PADDING = 0.75;
const DAY_NUMBER = 2;
const GAP = 0.25;
const LINE = 1.5;
const ICON = 2.25;
/** Room around the logos for the status badges on their corners. */
const ICON_EDGE = 0.5;

/**
 * How many bills fit under a day's date, from the room the grid gives each day: one per line with
 * names, or rows of logos without. Days fill the window, so a bigger screen shows more before
 * "+N more".
 */
function useBillsPerDay(grid: RefObject<HTMLElement | null>, names: boolean): number {
  const [fits, setFits] = useState(3);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const day = element.firstElementChild;
      if (!(day instanceof HTMLElement)) return;
      // The root size in pixels, which grows on very wide screens.
      const rem = Number(getComputedStyle(document.documentElement).fontSize.replace('px', ''));
      const height = day.clientHeight / rem - DAY_PADDING - DAY_NUMBER;
      if (names) {
        setFits(Math.max(1, Math.floor(height / (LINE + GAP))));
        return;
      }
      const width = day.clientWidth / rem - DAY_PADDING - ICON_EDGE;
      const perRow = Math.max(1, Math.floor((width + GAP) / (ICON + GAP)));
      const rows = Math.max(1, Math.floor((height - ICON_EDGE / 2 + GAP) / (ICON + GAP)));
      setFits(perRow * rows);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  });
  return fits;
}

const NAMES_KEY = 'remidy.calendar.names';

/** Whether the calendar shows bills' names beside their logos, remembered on this device. */
function useShowNames(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(NAMES_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const change = (next: boolean) => {
    setShow(next);
    try {
      localStorage.setItem(NAMES_KEY, String(next));
    } catch {
      // It still applies for this visit.
    }
  };
  return [show, change];
}

/** The day in the address, such as /calendar?day=2026-11-20 from Home's small calendar. */
function useDayInAddress(): CalendarDate | null {
  const search: unknown = useSearch({ strict: false });
  const day =
    typeof search === 'object' && search !== null ? (search as { day?: unknown }).day : null;
  return typeof day === 'string' ? parseCalendarDate(day) : null;
}

/**
 * One bill on a day in the grid: its logo and status, and its name when names are shown. Without
 * a name, it says the name when pointed at and to screen readers.
 */
function DayChip({
  entry,
  now,
  names,
  onOpen,
}: {
  entry: AgendaEntry;
  now: CalendarDate;
  names: boolean;
  onOpen: () => void;
}) {
  const status = DAY_STATUS[dayStatusOf(entry, now)];
  const Icon = status.icon;
  const label = `${entry.name}, ${status.label}`;
  const hint = `${entry.name}: ${status.label}, ${statusOf(entry, false).text}`;
  if (!names) {
    return (
      <Button
        variant="ghost"
        size="small"
        aria-label={label}
        title={hint}
        onClick={onOpen}
        className={cn(
          'relative size-9 flex-none rounded-lg p-0',
          (status === DAY_STATUS.paid || status === DAY_STATUS.skipped) && 'opacity-60',
        )}
      >
        <LogoTile src={logoUrl(entry.logoId)} name={entry.name} />
        {Icon ? (
          // Color alone isn't enough, so the status's icon sits on the logo's corner.
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface',
              status.text,
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="small"
      className={cn('w-full justify-start gap-1.5 px-1.5', status.chip)}
      aria-label={label}
      title={hint}
      onClick={onOpen}
    >
      <LogoTile size="small" src={logoUrl(entry.logoId)} name={entry.name} />
      <span className="min-w-0 flex-auto truncate text-left">{entry.name}</span>
      {Icon ? <Icon aria-hidden="true" className="size-4 flex-none" /> : null}
    </Button>
  );
}

/** Due dates and what's been paid, a month at a time, with each bill's logo and status. */
export function CalendarPage() {
  const now = browserToday();
  const dayInAddress = useDayInAddress();
  const [month, setMonth] = useState(firstOfMonth(dayInAddress ?? now));
  const narrow = useIsNarrow();
  // On a wide screen a day opens in a sheet; on a phone it's the chosen day under the grid.
  const [openDay, setOpenDay] = useState<CalendarDate | null>(narrow ? null : dayInAddress);
  const [chosen, setChosen] = useState<CalendarDate | null>(dayInAddress);
  const to = monthEnd(month);
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, month, to],
    queryFn: ({ signal }) => fetchAgenda(month, to, signal),
  });
  // The due date whose bill is open. Found in the agenda each time, so a payment shows at once.
  const [openId, setOpenId] = useState<string | null>(null);
  const grid = useRef<HTMLOListElement>(null);
  const [names, setNames] = useShowNames();
  const perDay = useBillsPerDay(grid, names);

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
  // The day chosen on a phone: the one picked in this month, or today, or the first with bills.
  const firstWithBills = entries.map((entry) => entry.dueOn).sort()[0];
  const selected =
    chosen && sameMonth(chosen, month)
      ? chosen
      : sameMonth(now, month)
        ? now
        : ((firstWithBills as CalendarDate | undefined) ?? month);

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
      {/* Phones list the bills by name already, so it's only for the grid. */}
      {/* Filled with a check while on, so it's clear which way it is. */}
      <Button
        variant={names ? 'primary' : 'secondary'}
        className="ml-auto hidden md:inline-flex"
        aria-pressed={names}
        onClick={() => {
          setNames(!names);
        }}
      >
        {names ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Tag aria-hidden="true" className="size-4" />
        )}
        Show names
      </Button>
    </div>
  );

  let body;
  if (agenda.isPending) body = <LoadingState label="Loading the calendar" />;
  else if (agenda.isError) {
    body = (
      <ErrorState message="The calendar couldn’t load." onRetry={() => void agenda.refetch()} />
    );
  } else {
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
                // Every bill when they all fit, or one fewer to make room for "+N more".
                const shown = count <= perDay ? count : perDay - 1;
                const more =
                  count > shown ? (
                    <Button
                      variant="ghost"
                      size="small"
                      className={cn('text-ink-2', names ? 'justify-start px-1.5' : 'h-9 px-1')}
                      onClick={() => {
                        setOpenDay(day);
                      }}
                    >
                      +{count - shown}
                      {names ? ' more' : null}
                      <span className="sr-only">
                        {names ? '' : ' more'} on {formatDate(day, 'long')}
                      </span>
                    </Button>
                  ) : null;
                const chips = items.slice(0, shown).map((entry) => (
                  <DayChip
                    key={entry.id}
                    entry={entry}
                    now={now}
                    names={names}
                    onOpen={() => {
                      setOpenId(entry.id);
                    }}
                  />
                ));
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
                    {names ? (
                      <>
                        {chips}
                        {more}
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-1 p-1 pt-0">
                        {chips}
                        {more}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        {/* On phones, a small grid with marks, and the chosen day's bills under it. */}
        <div className="md:hidden">
          <PhoneMonth
            month={month}
            entries={entries}
            today={now}
            selected={selected}
            onSelect={setChosen}
            onSwipe={(by) => {
              showMonth(addMonthsFromAnchor(month, by));
            }}
            onOpen={(entry) => {
              setOpenId(entry.id);
            }}
          />
        </div>
      </>
    );
  }

  const opened = entries.find((entry) => entry.id === openId) ?? null;
  return (
    <Page title="Calendar">
      {header}
      {body}
      {openDay && !opened ? (
        <DaySheet
          day={openDay}
          entries={entries.filter((entry) => entry.dueOn === openDay)}
          today={now}
          onClose={() => {
            setOpenDay(null);
          }}
          onOpen={(entry) => {
            setOpenId(entry.id);
          }}
        />
      ) : null}
      {opened ? (
        <BillViewer
          billId={opened.billId}
          due={opened}
          onClose={() => {
            setOpenId(null);
          }}
        />
      ) : null}
    </Page>
  );
}
