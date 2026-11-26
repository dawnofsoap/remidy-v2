import type { ReactNode } from 'react';
import { cn } from './cn.ts';

interface ModalActionsProps {
  /** Side actions such as Archive and Delete, kept apart on the left. */
  start?: ReactNode;
  /** Cancel or Back, then the main action last. Only the main action is a filled button. */
  children: ReactNode;
  /** Stays in view at the bottom while a long dialog scrolls. */
  sticky?: boolean;
  className?: string;
}

/**
 * A dialog's buttons, in the order used everywhere: side actions on the left, then Cancel, then the
 * main action in the bottom-right corner. On a phone they stack full width with the main action on
 * top, nearest the thumb, and the side actions below.
 */
export function ModalActions({ start, children, sticky = false, className }: ModalActionsProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between',
        sticky && 'sticky -bottom-6 -mx-6 border-t border-line bg-surface px-6 py-4',
        className,
      )}
    >
      {start ? (
        <div className="flex flex-wrap gap-2">{start}</div>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
        {children}
      </div>
    </div>
  );
}
