import { useEffect, type ReactNode } from 'react';
import { cn } from '../ui/index.ts';

/** The heading and browser tab title that every page shares. */
interface PageProps {
  title: string;
  /**
   * Keeps the title for screen readers only on phones, where something else heads the page, such
   * as the tab bar marking where you are.
   */
  hideTitleOnPhone?: boolean;
  /** The page's main action, such as Add bill, shown beside the title. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, hideTitleOnPhone = false, actions, children }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Remidy`;
  }, [title]);

  return (
    <div className="flex flex-col gap-6">
      {/* The row itself goes on phones, so no gap is left above when the title is hidden. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3',
          hideTitleOnPhone && 'max-md:contents',
        )}
      >
        <h1
          className={cn('text-3xl font-bold tracking-tight', hideTitleOnPhone && 'max-md:sr-only')}
        >
          {title}
        </h1>
        {actions}
      </div>
      {children}
    </div>
  );
}
