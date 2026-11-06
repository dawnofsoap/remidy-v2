import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

const controlStyles = cn(
  'min-h-11 w-full rounded-xl border border-field bg-surface px-3 text-ink',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-invalid:border-danger',
  focusRing,
);

interface FieldProps {
  label: string;
  /** Extra guidance shown under the control. */
  hint?: string;
  /** What went wrong and how to fix it. Marks the control invalid. */
  error?: string;
}

interface ControlIds {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

function FieldShell({
  label,
  hint,
  error,
  id,
  children,
}: FieldProps & { id: string; children: (ids: ControlIds) => ReactNode }) {
  const generated = useId();
  const controlId = id || generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="font-semibold">
        {label}
      </label>
      {children({
        id: controlId,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = FieldProps & Omit<ComponentProps<'input'>, 'aria-invalid'>;

export function TextField({ label, hint, error, id = '', className, ...props }: TextFieldProps) {
  const shell = { label, id, ...(hint ? { hint } : {}), ...(error ? { error } : {}) };
  return (
    <FieldShell {...shell}>
      {(ids) => <input {...props} {...ids} className={cn(controlStyles, className)} />}
    </FieldShell>
  );
}

type SelectFieldProps = FieldProps & Omit<ComponentProps<'select'>, 'aria-invalid'>;

/** A native select, which gives the best accessibility and phone behavior. */
export function SelectField({
  label,
  hint,
  error,
  id = '',
  className,
  children,
  ...props
}: SelectFieldProps) {
  const shell = { label, id, ...(hint ? { hint } : {}), ...(error ? { error } : {}) };
  return (
    <FieldShell {...shell}>
      {(ids) => (
        <select {...props} {...ids} className={cn(controlStyles, className)}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
