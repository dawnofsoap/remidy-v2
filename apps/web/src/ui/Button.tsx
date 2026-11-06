import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn, focusRing } from './cn.ts';

const buttonStyles = cva(
  [
    'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4',
    'font-semibold whitespace-nowrap',
    'disabled:cursor-not-allowed disabled:opacity-55',
    focusRing,
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent',
        secondary: 'border border-line bg-surface text-ink',
        ghost: 'bg-transparent text-ink',
        danger: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonStyles> {
  /** Shows that an action is running and stops it being triggered twice. */
  busy?: boolean;
}

export function Button({
  variant,
  busy = false,
  disabled = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(buttonStyles({ variant }), className)}
      {...props}
    />
  );
}
