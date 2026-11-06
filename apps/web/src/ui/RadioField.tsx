import { useId } from 'react';

interface RadioFieldProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}

/** One choice from a few options. Native radios keep arrow-key and screen reader support. */
export function RadioField<Value extends string>({
  label,
  value,
  options,
  onChange,
}: RadioFieldProps<Value>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1.5 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-field bg-surface px-4 has-checked:border-2 has-checked:border-accent has-checked:bg-accent-soft has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
