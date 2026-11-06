import {
  compareDates,
  dateInputValue,
  datePartsOf,
  formatDate,
  parseTypedDate,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { CalendarDays } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useRef, useState, type ComponentProps } from 'react';
import { Button } from './Button.tsx';
import { cn } from './cn.ts';
import { DateCalendar, toLocalDate } from './DateCalendar.tsx';
import { controlStyles, FieldShell, TextField, type FieldProps } from './Field.tsx';
import { Modal } from './Modal.tsx';
import { useIsPhone } from './useIsPhone.ts';

// Without limits, a mistyped year could be saved as the year 0026.
const EARLIEST = '1900-01-01' as CalendarDate;
const LATEST = '2099-12-31' as CalendarDate;

const NOT_A_DATE = 'Enter a date, such as 3/8/2026.';

const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);

type DateFieldProps = FieldProps &
  Omit<
    ComponentProps<'input'>,
    'aria-invalid' | 'value' | 'defaultValue' | 'type' | 'onChange' | 'min' | 'max' | 'ref'
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
 * how it was understood. The calendar is a popup on larger screens and a bottom sheet on phones.
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
  onClick,
  onKeyDown,
  ...props
}: DateFieldProps) {
  const asText = (value: CalendarDate | null) => (value ? dateInputValue(value) : '');
  const [text, setText] = useState(asText(date));
  const [seenDate, setSeenDate] = useState(date);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const isPhone = useIsPhone();
  const [month, setMonth] = useState<Date>();
  // From the button, focus moves into the calendar. From the text, it stays there for typing.
  const [openedFromText, setOpenedFromText] = useState(false);
  const textInput = useRef<HTMLInputElement>(null);
  const closedByLeaving = useRef(false);

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

  function choose(chosen: CalendarDate) {
    setText(dateInputValue(chosen));
    setProblem(null);
    onDateChange?.(chosen);
    setOpen(false);
  }

  function changeText(value: string) {
    setText(value);
    setProblem(null);
    const typed = acceptable(value);
    onDateChange?.(typed);
    if (typed) setMonth(toLocalDate(typed));
  }

  const selected = acceptable(text);

  function changeOpen(next: boolean) {
    if (next) {
      closedByLeaving.current = false;
      setMonth(toLocalDate(selected ?? browserToday()));
    }
    setOpen(next);
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
        <>
          <Popover.Root open={open && !isPhone} onOpenChange={changeOpen}>
            <div className="relative">
              <input
                ref={textInput}
                placeholder="MM/DD/YYYY"
                {...props}
                {...ids}
                type="text"
                autoComplete="off"
                value={text}
                className={cn(controlStyles, 'pr-12 placeholder:text-ink-2', className)}
                // On a phone the sheet opens instead, so the on-screen keyboard shouldn't as well.
                {...(isPhone ? { inputMode: 'none' as const } : {})}
                onChange={(event) => {
                  changeText(event.target.value);
                }}
                onKeyDown={(event) => {
                  // The next stop is the calendar's own button, which wouldn't count as leaving.
                  if (event.key === 'Tab' && open) {
                    closedByLeaving.current = true;
                    setOpen(false);
                  }
                  onKeyDown?.(event);
                }}
                onClick={(event) => {
                  if (!open) {
                    setOpenedFromText(true);
                    changeOpen(true);
                  }
                  onClick?.(event);
                }}
                onBlur={(event) => {
                  leave();
                  onBlur?.(event);
                }}
              />
              <Popover.Trigger
                aria-label={`Choose ${label} from a calendar`}
                className="group absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-xl outline-none"
                onClick={() => {
                  setOpenedFromText(false);
                }}
              >
                {/* The highlight is smaller than the button, so it stays clear of the field's edge. */}
                <span
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-lg text-ink',
                    'group-hover:bg-surface-2 group-data-[state=open]:bg-surface-2',
                    'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ink',
                  )}
                >
                  <CalendarDays aria-hidden="true" className="size-5" />
                </span>
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
                onInteractOutside={(event) => {
                  // Clicking back into the text is still using this field.
                  if (event.target === textInput.current) event.preventDefault();
                  else closedByLeaving.current = true;
                }}
                onCloseAutoFocus={(event) => {
                  if (!openedFromText) return;
                  event.preventDefault();
                  if (!closedByLeaving.current) textInput.current?.focus();
                }}
              >
                <DateCalendar
                  month={month ?? toLocalDate(selected ?? browserToday())}
                  onMonthChange={setMonth}
                  min={min}
                  max={max}
                  selected={selected}
                  onChoose={choose}
                  focusDay={!openedFromText}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {isPhone ? (
            <Modal
              open={open}
              onOpenChange={changeOpen}
              title={`Choose ${label}`}
              description="Pick a day, or type the date below."
            >
              <div className="self-center">
                <DateCalendar
                  month={month ?? toLocalDate(selected ?? browserToday())}
                  onMonthChange={setMonth}
                  min={min}
                  max={max}
                  selected={selected}
                  onChoose={choose}
                  focusDay={false}
                />
              </div>
              <TextField
                label="Or type the date"
                placeholder="MM/DD/YYYY"
                autoComplete="off"
                value={text}
                onChange={(event) => {
                  changeText(event.target.value);
                }}
                onBlur={leave}
                {...(problem ? { error: problem } : {})}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  changeOpen(false);
                }}
              >
                Done
              </Button>
            </Modal>
          ) : null}
        </>
      )}
    </FieldShell>
  );
}
