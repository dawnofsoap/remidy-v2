import type { ReactNode } from 'react';
import { Button } from './Button.tsx';

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
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={panelStyles}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-ink-2">{description}</p>
      {action}
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
