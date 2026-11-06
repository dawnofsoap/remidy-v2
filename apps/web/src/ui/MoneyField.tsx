import { moneyInputValue, parseMoney, type Cents } from '@remidy/domain';
import { useState, type ComponentProps } from 'react';
import { cn } from './cn.ts';
import { controlStyles, FieldShell, type FieldProps } from './Field.tsx';

const NOT_AN_AMOUNT = 'Enter an amount, such as 42.50.';

type MoneyFieldProps = FieldProps &
  Omit<ComponentProps<'input'>, 'aria-invalid' | 'value' | 'defaultValue' | 'type' | 'onChange'> & {
    /** The amount, or null when the field is empty or doesn't hold a valid amount yet. */
    cents?: Cents | null;
    onCentsChange?: (cents: Cents | null) => void;
  };

const asText = (cents: Cents | null) => (cents === null ? '' : moneyInputValue(cents));

/**
 * Takes an amount in dollars, the way people type it: 5, 5.5, $1,000. On leaving the field, what
 * was typed is tidied to show how it was understood, so 5 becomes 5.00.
 */
export function MoneyField({
  label,
  hint,
  error,
  id = '',
  className,
  cents = null,
  onCentsChange,
  onBlur,
  ...props
}: MoneyFieldProps) {
  const [text, setText] = useState(asText(cents));
  const [seenCents, setSeenCents] = useState(cents);
  const [unreadable, setUnreadable] = useState(false);

  // Follow changes from outside, such as a form being reset, but not this field's own typing.
  if (cents !== seenCents) {
    setSeenCents(cents);
    if (cents !== parseMoney(text)) setText(asText(cents));
  }

  const shownError = unreadable ? NOT_AN_AMOUNT : error;
  const shell = {
    label,
    id,
    ...(hint ? { hint } : {}),
    ...(shownError ? { error: shownError } : {}),
  };

  return (
    <FieldShell {...shell}>
      {(ids) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-2"
          >
            $
          </span>
          <input
            {...props}
            {...ids}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            className={cn(controlStyles, 'pl-7', className)}
            onChange={(event) => {
              setText(event.target.value);
              setUnreadable(false);
              onCentsChange?.(parseMoney(event.target.value));
            }}
            onBlur={(event) => {
              const parsed = parseMoney(text);
              if (parsed !== null) setText(moneyInputValue(parsed));
              else if (text.trim()) setUnreadable(true);
              onBlur?.(event);
            }}
          />
        </div>
      )}
    </FieldShell>
  );
}
