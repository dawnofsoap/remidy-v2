import {
  compareDates,
  dateFromParts,
  dateInputValue,
  datePartsOf,
  formatDate,
  parseTypedDate,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { CalendarDays } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState, type ComponentProps } from 'react';
import { DayPicker, type Modifiers } from 'react-day-picker';
import { cn, focusRing } from './cn.ts';
import { controlStyles, FieldShell, type FieldProps } from './Field.tsx';

// Without limits, a mistyped year could be saved as the year 0026.
const EARLIEST = '1900-01-01' as CalendarDate;
const LATEST = '2099-12-31' as CalendarDate;

const NOT_A_DATE = 'Enter a date, such as 3/8/2026.';

const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);

// The calendar works in local Date objects, and these are the only places that meet them. Noon
// can't fall in a daylight saving gap, and only local parts are read, so no time zone can shift it.
function toLocalDate(date: CalendarDate): Date {
  const { year, month, day } = datePartsOf(date);
  return new Date(year, month - 1, day, 12);
}

function fromLocalDate(date: Date): CalendarDate | null {
  return dateFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const buttonStyles = cn(
  'inline-flex size-11 items-center justify-center rounded-xl text-ink hover:bg-surface-2',
  focusRing,
);

const calendarStyles = {
  root: 'relative',
  month: 'flex flex-col gap-1',
  month_caption: 'flex h-11 items-center justify-center px-11 font-semibold',
  nav: 'absolute inset-x-0 top-0 flex justify-between',
  button_previous: cn(buttonStyles, 'disabled:opacity-40 disabled:hover:bg-transparent'),
  button_next: cn(buttonStyles, 'disabled:opacity-40 disabled:hover:bg-transparent'),
  chevron: 'size-4 fill-current',
  month_grid: 'border-collapse',
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

type DateFieldProps = FieldProps &
  Omit<
    ComponentProps<'input'>,
    'aria-invalid' | 'value' | 'defaultValue' | 'type' | 'onChange' | 'min' | 'max'
  > & {
    /** The date, or null when the field is empty or doesn't hold an acceptable date yet. */
    date?: CalendarDate | null;
    onDateChange?: (date: CalendarDate | null) => void;
    /** The earliest date allowed. */
    min?: CalendarDate | undefined;
    /** The latest date allowed. */
    max?: CalendarDate | undefined;
  };

/**
 * For a calendar date, such as when a bill is due. It can be typed the way people write dates,
 * such as 3/8/26, or chosen from a calendar. On leaving the field, what was typed is tidied to show
 * how it was understood.
 */
export function DateField({
  label,
  hint,
  error,
  id = '',
  className,
  date = null,
  onDateChange,
  min = EARLIEST,
  max = LATEST,
  onBlur,
  ...props
}: DateFieldProps) {
  const asText = (value: CalendarDate | null) => (value ? dateInputValue(value) : '');
  const [text, setText] = useState(asText(date));
  const [seenDate, setSeenDate] = useState(date);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const read = (value: string) => parseTypedDate(value, datePartsOf(browserToday()).year);
  const inRange = (value: CalendarDate) =>
    compareDates(value, min) >= 0 && compareDates(value, max) <= 0;
  const acceptable = (value: string): CalendarDate | null => {
    const parsed = read(value);
    return parsed && inRange(parsed) ? parsed : null;
  };

  // Follow changes from outside, such as a form being reset, but not this field's own typing.
  if (date !== seenDate) {
    setSeenDate(date);
    if (date !== acceptable(text)) {
      setText(asText(date));
      setProblem(null);
    }
  }

  // Shown on leaving the field, because a date is often incomplete partway through typing it.
  function leave() {
    if (!text.trim()) return;
    const parsed = read(text);
    if (!parsed) setProblem(NOT_A_DATE);
    else if (compareDates(parsed, min) < 0) setProblem(`Choose ${formatDate(min)} or later.`);
    else if (compareDates(parsed, max) > 0) setProblem(`Choose ${formatDate(max)} or earlier.`);
    else setText(dateInputValue(parsed));
  }

  function choose(day: Date | undefined) {
    const chosen = day ? fromLocalDate(day) : null;
    if (chosen) {
      setText(dateInputValue(chosen));
      setProblem(null);
      onDateChange?.(chosen);
    }
    setOpen(false);
  }

  const selected = acceptable(text);
  const startingDate = selected ?? browserToday();
  const shownError = problem ?? error;
  const shell = {
    label,
    id,
    ...(hint ? { hint } : {}),
    ...(shownError ? { error: shownError } : {}),
  };

  return (
    <FieldShell {...shell}>
      {(ids) => (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <div className="relative">
            <input
              placeholder="MM/DD/YYYY"
              {...props}
              {...ids}
              type="text"
              autoComplete="off"
              value={text}
              className={cn(controlStyles, 'pr-12 placeholder:text-ink-2', className)}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(null);
                onDateChange?.(acceptable(event.target.value));
              }}
              onBlur={(event) => {
                leave();
                onBlur?.(event);
              }}
            />
            <Popover.Trigger
              aria-label={`Choose ${label} from a calendar`}
              className={cn(buttonStyles, 'absolute inset-y-0 right-0')}
            >
              <CalendarDays aria-hidden="true" className="size-5" />
            </Popover.Trigger>
          </div>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              collisionPadding={8}
              aria-label={`Choose ${label}`}
              className="rounded-2xl border border-line bg-surface p-2 text-ink shadow-lg"
              // The calendar puts focus on the selected day or today, rather than the first button.
              onOpenAutoFocus={(event) => {
                event.preventDefault();
              }}
            >
              <DayPicker
                mode="single"
                // People open this on purpose, and keyboard users need to land on a day.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                labels={{ labelDayButton: dayButtonLabel }}
                showOutsideDays
                classNames={calendarStyles}
                defaultMonth={toLocalDate(startingDate)}
                startMonth={toLocalDate(min)}
                endMonth={toLocalDate(max)}
                disabled={{ before: toLocalDate(min), after: toLocalDate(max) }}
                {...(selected ? { selected: toLocalDate(selected) } : {})}
                onSelect={choose}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </FieldShell>
  );
}
