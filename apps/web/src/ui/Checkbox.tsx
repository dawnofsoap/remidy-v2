import { useId, type ReactNode } from 'react';

interface CheckboxProps {
  label: string;
  /** More about the choice, read with the label. */
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** One yes-or-no choice. A native checkbox, so the keyboard and screen readers work as usual. */
export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        {...(description ? { 'aria-describedby': `${id}-description` } : {})}
        className="mt-0.5 size-5 flex-none cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      <div className="flex min-w-0 flex-col">
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
