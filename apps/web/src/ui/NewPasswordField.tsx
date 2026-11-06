import { PASSWORD_REQUIREMENTS, unmetPasswordRequirements } from '@remidy/contracts';
import { Check, X } from 'lucide-react';
import { useId, useState, type ComponentProps } from 'react';
import { cn } from './cn.ts';
import { controlStyles, FieldShell, type FieldProps } from './Field.tsx';

const NOT_READY = 'This password doesn’t meet every requirement yet.';

type NewPasswordFieldProps = FieldProps &
  Omit<ComponentProps<'input'>, 'aria-invalid' | 'type' | 'autoComplete' | 'value'> & {
    value: string;
  };

/** True once a password can be submitted. Forms check this, and the server checks again. */
export function isPasswordReady(password: string): boolean {
  return unmetPasswordRequirements(password).length === 0;
}

/**
 * For choosing a password. It lists the requirements and ticks them off during typing, and stays
 * in its error state from the moment it's used until every one of them is met.
 */
export function NewPasswordField({
  label,
  hint,
  error,
  id = '',
  className,
  value,
  onFocus,
  ...props
}: NewPasswordFieldProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const unmet = unmetPasswordRequirements(value);
  const shownError = error ?? ((focused || value) && unmet.length > 0 ? NOT_READY : undefined);
  const inErrorState = Boolean(shownError);

  const shown = PASSWORD_REQUIREMENTS.filter(
    (requirement) => !requirement.onlyShownWhenUnmet || unmet.includes(requirement),
  );
  const metCount = shown.length - shown.filter((item) => unmet.includes(item)).length;
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
          <input
            {...props}
            {...ids}
            aria-describedby={[ids['aria-describedby'], listId].filter(Boolean).join(' ')}
            type="password"
            autoComplete="new-password"
            value={value}
            className={cn(controlStyles, className)}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
          />
          <ul id={listId} aria-label="Password requirements" className="flex flex-col gap-1 pt-1">
            {shown.map((requirement) => {
              const met = !unmet.includes(requirement);
              const Icon = met ? Check : X;
              return (
                <li
                  key={requirement.id}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    met ? 'text-ink' : inErrorState ? 'text-danger' : 'text-ink-2',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span>
                    {requirement.label}
                    <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p aria-live="polite" className="sr-only">
            {value ? `${String(metCount)} of ${String(shown.length)} requirements met` : ''}
          </p>
        </>
      )}
    </FieldShell>
  );
}
