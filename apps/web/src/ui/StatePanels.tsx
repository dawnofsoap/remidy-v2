import type { ReactNode } from 'react';
import { Button } from './Button.tsx';
import { cn } from './cn.ts';

const panelStyles = 'flex flex-col items-center gap-3 rounded-2xl p-8 text-center';

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className={panelStyles}>
      <span
        aria-hidden="true"
        className="size-6 rounded-full border-2 border-upcoming border-t-transparent motion-safe:animate-spin"
      />
      <p className="text-ink-2">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  /** The next step, usually a button. */
  action?: ReactNode;
  /**
   * For a page with nothing on it: centers the message in the whole content area beside the
   * navigation, rather than in the column lists use.
   */
  fillPage?: boolean;
}

export function EmptyState({ title, description, action, fillPage = false }: EmptyStateProps) {
  const panel = (
    <div className={cn(panelStyles, fillPage && 'pointer-events-auto')}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-ink-2">{description}</p>
      {action}
    </div>
  );
  if (!fillPage) return panel;
  return (
    // The page's main area is the positioning parent. Clicks pass through the empty space around it.
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-20 flex items-center justify-center p-4 md:bottom-0">
      {panel}
    </div>
  );
}

interface ErrorStateProps {
  /** What went wrong and what to do about it. */
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className={panelStyles}>
      <p className="max-w-prose font-semibold text-danger">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
