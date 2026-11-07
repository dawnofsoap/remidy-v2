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
const YEARS_PER_PAGE = 12;

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
  month_grid: 'w-full table-fixed border-collapse',
  weekday: 'h-(--row) text-sm font-normal text-ink-2',
  day: 'p-0 text-center',
  day_button: cn(
    'mx-auto block h-(--row) w-full max-w-14 rounded-xl hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-transparent',
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
}

/** Months or years. Arrow keys move around it, and it opens on the current one. */
function ChoiceGrid<T>({ label, choices, onChoose }: ChoiceGridProps<T>) {
  const grid = useRef<HTMLDivElement>(null);
  const buttons = () => [...(grid.current?.querySelectorAll('button:not(:disabled)') ?? [])];
  const hasCurrent = choices.some((choice) => choice.current);

  useEffect(() => {
    const start = grid.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    start?.focus();
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
      className="grid h-[calc(var(--row)*7)] auto-rows-fr grid-cols-3 gap-1"
    >
      {choices.map((choice, index) => (
        <button
          key={choice.text}
          type="button"
          disabled={choice.disabled}
          aria-current={choice.current ? 'true' : undefined}
          // A page of years may not hold the current one, and the keyboard still needs a way in.
          tabIndex={choice.current || (index === 0 && !hasCurrent) ? 0 : -1}
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
  /** Fills the width it's given, and fits its rows to the height of a phone's screen. */
  fill?: boolean;
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
  fill = false,
}: DateCalendarProps) {
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  // Once someone has moved around inside, a day should take focus when the days come back.
  const [moved, setMoved] = useState(false);
  const [yearPage, setYearPage] = useState(0);

  const earliest = monthNumber(toLocalDate(min));
  const latest = monthNumber(toLocalDate(max));
  const shown = monthNumber(month);
  const showMonth = (number: number) => {
    onMonthChange(firstOfMonth(Math.min(Math.max(number, earliest), latest)));
  };
  const firstYear = Math.floor(earliest / 12);
  const lastYear = Math.floor(latest / 12);
  const toggle = (next: 'months' | 'years') => {
    setMoved(true);
    if (next === 'years') {
      setYearPage(Math.floor((month.getFullYear() - firstYear) / YEARS_PER_PAGE));
    }
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
  const pageStart = firstYear + yearPage * YEARS_PER_PAGE;
  for (let each = pageStart; each < pageStart + YEARS_PER_PAGE && each <= lastYear; each += 1) {
    years.push(each);
  }

  // The arrows change the month over the days, and the page over the years.
  const arrows = {
    days: {
      back: {
        label: 'Previous month',
        disabled: shown <= earliest,
        go: () => {
          showMonth(shown - 1);
        },
      },
      next: {
        label: 'Next month',
        disabled: shown >= latest,
        go: () => {
          showMonth(shown + 1);
        },
      },
    },
    years: {
      back: {
        label: 'Earlier years',
        disabled: yearPage === 0,
        go: () => {
          setYearPage(yearPage - 1);
        },
      },
      next: {
        label: 'Later years',
        disabled: pageStart + YEARS_PER_PAGE > lastYear,
        go: () => {
          setYearPage(yearPage + 1);
        },
      },
    },
    months: null,
  }[view];

  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        fill
          ? 'w-full [--row:clamp(2.25rem,calc((90dvh-14.5rem)/7),2.75rem)]'
          : // The popup's rows fit the room it has. 4.25rem is its header, gap, padding and border.
            'w-77 [--row:clamp(2rem,calc((var(--radix-popover-content-available-height,100dvh)-4.25rem)/7),2.75rem)]',
      )}
    >
      <div className="flex items-center justify-between">
        {arrows ? (
          <button
            type="button"
            aria-label={arrows.back.label}
            disabled={arrows.back.disabled}
            className={iconButton}
            onClick={arrows.back.go}
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
        {arrows ? (
          <button
            type="button"
            aria-label={arrows.next.label}
            disabled={arrows.next.disabled}
            className={iconButton}
            onClick={arrows.next.go}
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
