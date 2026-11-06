import { dateFromParts, datePartsOf, type CalendarDate } from '@remidy/domain';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DayPicker, type Modifiers } from 'react-day-picker';
import { cn, focusRing } from './cn.ts';

// The calendar works in local Date objects, and these are the only places that meet them. Noon
// can't fall in a daylight saving gap, and only local parts are read, so no time zone can shift it.
export function toLocalDate(date: CalendarDate): Date {
  const { year, month, day } = datePartsOf(date);
  return new Date(year, month - 1, day, 12);
}

function fromLocalDate(date: Date): CalendarDate | null {
  return dateFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const COLUMNS = 3;

/** Counts months, so that two can be compared whatever their years. */
const monthNumber = (date: Date) => date.getFullYear() * 12 + date.getMonth();
const firstOfMonth = (number: number) => new Date(Math.floor(number / 12), number % 12, 1, 12);

const iconButton = cn(
  'inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-2',
  'disabled:opacity-40 disabled:hover:bg-transparent',
  focusRing,
);

const dayStyles = {
  root: 'w-full',
  month_grid: 'w-full border-collapse',
  weekday: 'size-11 text-sm font-normal text-ink-2',
  day: 'p-0 text-center',
  day_button: cn(
    'size-11 rounded-xl hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent',
    focusRing,
  ),
  selected:
    'font-semibold [&>button]:bg-accent [&>button]:text-on-accent [&>button]:hover:bg-accent',
  today: 'font-semibold [&>button]:underline [&>button]:underline-offset-4',
  outside: 'text-ink-2',
  disabled: 'text-ink-2 [&>button]:opacity-40',
};

/**
 * The library would say "March 8th" on a button showing 8, so voice control users saying "click 8"
 * wouldn't match it. This keeps the number as it's shown.
 */
function dayButtonLabel(day: Date, modifiers: Modifiers): string {
  const name = day.toLocaleDateString('en-US', { dateStyle: 'full' });
  return [modifiers.today ? 'Today' : null, name, modifiers.selected ? 'selected' : null]
    .filter(Boolean)
    .join(', ');
}

interface ChoiceGridProps<T> {
  label: string;
  choices: { value: T; text: string; disabled: boolean; current: boolean }[];
  onChoose: (value: T) => void;
  /** Rows share the space when they all fit, and otherwise keep their size and scroll. */
  scrolls?: boolean;
}

/** All the months or all the years. Arrow keys move around it, and it opens on the current one. */
function ChoiceGrid<T>({ label, choices, onChoose, scrolls = false }: ChoiceGridProps<T>) {
  const grid = useRef<HTMLDivElement>(null);
  const buttons = () => [...(grid.current?.querySelectorAll('button:not(:disabled)') ?? [])];

  useEffect(() => {
    const start = grid.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    start?.focus();
    start?.scrollIntoView({ block: 'center' });
  }, []);

  function moveFocus(event: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[event.key];
    if (!step) return;
    event.preventDefault();
    const all = buttons();
    const next = all[all.indexOf(event.target as Element) + step];
    if (next instanceof HTMLElement) next.focus();
  }

  return (
    <div
      ref={grid}
      role="group"
      aria-label={label}
      className={cn(
        'grid h-77 grid-cols-3 gap-1 p-1',
        scrolls ? 'content-start overflow-y-auto' : 'auto-rows-fr',
      )}
    >
      {choices.map((choice) => (
        <button
          key={choice.text}
          type="button"
          disabled={choice.disabled}
          aria-current={choice.current ? 'true' : undefined}
          tabIndex={choice.current ? 0 : -1}
          onKeyDown={moveFocus}
          onClick={() => {
            onChoose(choice.value);
          }}
          className={cn(
            'min-h-11 rounded-xl hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            choice.current && 'bg-accent font-semibold text-on-accent hover:bg-accent',
            focusRing,
          )}
        >
          {choice.text}
        </button>
      ))}
    </div>
  );
}

interface DateCalendarProps {
  month: Date;
  onMonthChange: (month: Date) => void;
  min: CalendarDate;
  max: CalendarDate;
  selected: CalendarDate | null;
  onChoose: (date: CalendarDate) => void;
  /** Whether a day takes focus on opening, rather than leaving it where it is. */
  focusDay: boolean;
}

/** A month of days. Its month and year in the header open the full list of each. */
export function DateCalendar({
  month,
  onMonthChange,
  min,
  max,
  selected,
  onChoose,
  focusDay,
}: DateCalendarProps) {
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  // Once someone has moved around inside, a day should take focus when the days come back.
  const [moved, setMoved] = useState(false);

  const earliest = monthNumber(toLocalDate(min));
  const latest = monthNumber(toLocalDate(max));
  const shown = monthNumber(month);
  const showMonth = (number: number) => {
    onMonthChange(firstOfMonth(Math.min(Math.max(number, earliest), latest)));
  };
  const toggle = (next: 'months' | 'years') => {
    setMoved(true);
    setView(view === next ? 'days' : next);
  };
  const backToDays = (number: number) => {
    showMonth(number);
    setView('days');
  };

  const monthName = MONTHS[month.getMonth()] ?? '';
  const year = month.getFullYear();
  const headerButton = (isOpen: boolean) =>
    cn(
      'min-h-11 rounded-xl px-2 font-semibold hover:bg-surface-2',
      isOpen && 'bg-surface-2',
      focusRing,
    );

  const years = [];
  for (let each = Math.floor(earliest / 12); each <= Math.floor(latest / 12); each += 1) {
    years.push(each);
  }

  return (
    <div className="flex w-77 flex-col gap-1">
      <div className="flex items-center justify-between">
        {view === 'days' ? (
          <button
            type="button"
            aria-label="Previous month"
            disabled={shown <= earliest}
            className={iconButton}
            onClick={() => {
              showMonth(shown - 1);
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <span className="size-11" />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`${monthName}, choose a month`}
            aria-expanded={view === 'months'}
            className={headerButton(view === 'months')}
            onClick={() => {
              toggle('months');
            }}
          >
            {monthName}
          </button>
          <button
            type="button"
            aria-label={`${String(year)}, choose a year`}
            aria-expanded={view === 'years'}
            className={headerButton(view === 'years')}
            onClick={() => {
              toggle('years');
            }}
          >
            {year}
          </button>
        </div>
        {view === 'days' ? (
          <button
            type="button"
            aria-label="Next month"
            disabled={shown >= latest}
            className={iconButton}
            onClick={() => {
              showMonth(shown + 1);
            }}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {view === 'months' ? (
        <ChoiceGrid
          label="Months"
          choices={MONTHS.map((name, index) => {
            const number = year * 12 + index;
            return {
              value: number,
              text: name.slice(0, 3),
              disabled: number < earliest || number > latest,
              current: number === shown,
            };
          })}
          onChoose={backToDays}
        />
      ) : null}

      {view === 'years' ? (
        <ChoiceGrid
          label="Years"
          scrolls
          choices={years.map((each) => ({
            value: each * 12 + month.getMonth(),
            text: String(each),
            disabled: false,
            current: each === year,
          }))}
          onChoose={backToDays}
        />
      ) : null}

      {view === 'days' ? (
        <DayPicker
          mode="single"
          // People open this on purpose, and keyboard users need to land on a day.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={focusDay || moved}
          hideNavigation
          fixedWeeks
          showOutsideDays
          components={{ MonthCaption: () => <></> }}
          labels={{ labelDayButton: dayButtonLabel }}
          classNames={dayStyles}
          month={month}
          onMonthChange={onMonthChange}
          startMonth={toLocalDate(min)}
          endMonth={toLocalDate(max)}
          disabled={{ before: toLocalDate(min), after: toLocalDate(max) }}
          {...(selected ? { selected: toLocalDate(selected) } : {})}
          onSelect={(day) => {
            const chosen = day ? fromLocalDate(day) : selected;
            if (chosen) onChoose(chosen);
          }}
        />
      ) : null}
    </div>
  );
}
