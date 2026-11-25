import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';

interface CheckboxProps {
  label: string;
  /** More about the choice, read with the label. */
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * One yes-or-no choice. A native checkbox, so the keyboard and screen readers work as usual. It's
 * drawn at 20px but takes taps across 44px, and the label beside it can be tapped too.
 */
export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-1">
      <span className="relative -my-3 -ml-3 grid size-11 flex-none place-items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          {...(description ? { 'aria-describedby': `${id}-description` } : {})}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none grid size-5 place-items-center rounded-md border-2 border-field bg-surface text-on-accent peer-checked:border-accent peer-checked:bg-accent peer-disabled:opacity-50 [&>svg]:invisible peer-checked:[&>svg]:visible"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </span>
      <div className="flex min-w-0 flex-col pt-px">
        <label htmlFor={id} className="cursor-pointer font-semibold">
          {label}
        </label>
        {description ? (
          <div id={`${id}-description`} className="text-sm text-ink-2">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
