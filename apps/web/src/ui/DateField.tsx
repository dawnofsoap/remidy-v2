import { compareDates, formatDate, parseCalendarDate, type CalendarDate } from '@remidy/domain';
import { useState, type ComponentProps } from 'react';
import { cn } from './cn.ts';
import { controlStyles, FieldShell, type FieldProps } from './Field.tsx';

// Without limits, a year typed as 26 would be accepted as the year 0026.
const EARLIEST = '1900-01-01' as CalendarDate;
const LATEST = '2099-12-31' as CalendarDate;

const NOT_A_DATE = 'Enter the full date, including the year.';

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
 * For a calendar date, such as when a bill is due. It uses the browser's own date input, which
 * gives phones their native picker, and gives back a plain date with no time zone to shift it.
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
  const [text, setText] = useState<string>(date ?? '');
  const [seenDate, setSeenDate] = useState(date);
  const [problem, setProblem] = useState<string | null>(null);

  const acceptable = (value: string): CalendarDate | null => {
    const parsed = parseCalendarDate(value);
    if (!parsed || compareDates(parsed, min) < 0 || compareDates(parsed, max) > 0) return null;
    return parsed;
  };

  // Follow changes from outside, such as a form being reset, but not this field's own typing.
  if (date !== seenDate) {
    setSeenDate(date);
    if (date !== acceptable(text)) {
      setText(date ?? '');
      setProblem(null);
    }
  }

  // Shown on leaving the field, because a date is often out of range partway through typing it.
  function check(input: HTMLInputElement): string | null {
    // A partly typed date has an empty value, so only the browser knows that anything is there.
    if (input.validity.badInput) return NOT_A_DATE;
    const parsed = parseCalendarDate(text);
    if (!parsed) return null;
    if (compareDates(parsed, min) < 0) return `Choose ${formatDate(min)} or later.`;
    if (compareDates(parsed, max) > 0) return `Choose ${formatDate(max)} or earlier.`;
    return null;
  }

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
        <input
          {...props}
          {...ids}
          type="date"
          min={min}
          max={max}
          value={text}
          className={cn(controlStyles, className)}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
            onDateChange?.(acceptable(event.target.value));
          }}
          onBlur={(event) => {
            setProblem(check(event.target));
            onBlur?.(event);
          }}
        />
      )}
    </FieldShell>
  );
}
