import type { AgendaEntry } from '@remidy/contracts';
import { datePartsOf, formatDate, type CalendarDate } from '@remidy/domain';
import { useRef } from 'react';
import { Button, cn, List, ListRow, LogoTile } from '../../../ui/index.ts';
import { logoUrl } from '../api.ts';
import { gridDays, sameMonth, WEEKDAYS } from './calendarGrid.ts';
import { byUrgency, DAY_STATUS, dayStatusOf, mostUrgent } from './dayStatus.ts';
import { statusOf } from './dueStatus.ts';

/** How far, in pixels, a finger has to travel sideways to change the month. */
const SWIPE = 50;

interface PhoneMonthProps {
  month: CalendarDate;
  entries: AgendaEntry[];
  today: CalendarDate;
  selected: CalendarDate;
  onSelect: (day: CalendarDate) => void;
  /** Moves a month back (-1) or on (1), from a swipe. */
  onSwipe: (by: -1 | 1) => void;
  onOpen: (entry: AgendaEntry) => void;
}

/**
 * The calendar on a phone: the month as a small grid, with a mark on each day with bills, and the
 * chosen day's bills listed under it. A swipe across the grid changes the month.
 */
export function PhoneMonth({
  month,
  entries,
  today,
  selected,
  onSelect,
  onSwipe,
  onOpen,
}: PhoneMonthProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDay = (day: CalendarDate) =>
    byUrgency(
      entries.filter((entry) => entry.dueOn === day),
      today,
    );
  const chosen = onDay(selected);
  const title = formatDate(month, 'monthYear');

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex touch-pan-y flex-col gap-1 rounded-2xl border border-line bg-surface p-2"
        onPointerDown={(event) => {
          start.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (!from || event.pointerType === 'mouse') return;
          const across = event.clientX - from.x;
          // Mostly sideways, so scrolling the page doesn't change the month.
          if (Math.abs(across) < SWIPE || Math.abs(across) < Math.abs(event.clientY - from.y)) {
            return;
          }
          onSwipe(across < 0 ? 1 : -1);
        }}
      >
        {/* Each day reads its full date, so the weekday row is for sight only. */}
        <div aria-hidden="true" className="grid grid-cols-7 text-center text-xs text-ink-2">
          {WEEKDAYS.map((name) => (
            <span key={name} className="py-1">
              {name.charAt(0)}
            </span>
          ))}
        </div>
        <ol aria-label={title} className="grid grid-cols-7 text-center">
          {gridDays(month).map((day) => {
            if (!sameMonth(day, month)) return <li key={day} aria-hidden="true" />;
            const bills = onDay(day);
            const urgent = mostUrgent(bills, today);
            const label = [
              formatDate(day, 'long'),
              day === today ? 'today' : null,
              urgent
                ? `${String(bills.length)} due, ${DAY_STATUS[urgent].label.toLowerCase()}`
                : null,
            ]
              .filter(Boolean)
              .join(', ');
            const isSelected = day === selected;
            return (
              <li key={day}>
                <Button
                  variant="ghost"
                  aria-label={label}
                  aria-pressed={isSelected}
                  {...(day === today ? { 'aria-current': 'date' as const } : {})}
                  onClick={() => {
                    onSelect(day);
                  }}
                  className={cn(
                    'mx-auto size-11 flex-col gap-0.5 rounded-full px-0 font-normal tabular-nums',
                    day === today && 'font-semibold text-accent-text ring-1 ring-accent',
                    isSelected && 'bg-accent text-on-accent',
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
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
      <section aria-labelledby="chosen-day" className="flex flex-col gap-2" aria-live="polite">
        <h3 id="chosen-day" className="font-semibold">
          {formatDate(selected, 'long')}
          {selected === today ? ' · Today' : ''}
        </h3>
        {chosen.length === 0 ? (
          <p className="text-ink-2">Nothing due this day.</p>
        ) : (
          <List label={formatDate(selected, 'long')}>
            {chosen.map((entry) => {
              const status = DAY_STATUS[dayStatusOf(entry, today)];
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
                    onOpen(entry);
                  }}
                />
              );
            })}
          </List>
        )}
      </section>
    </div>
  );
}
