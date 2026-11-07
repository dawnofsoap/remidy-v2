import { useEffect, type ReactNode } from 'react';
import { cn } from '../ui/index.ts';

/** The heading and browser tab title that every page shares. */
interface PageProps {
  title: string;
  /** Keeps the title for screen readers only on phones, where something else heads the page. */
  hideTitleOnPhone?: boolean;
  children: ReactNode;
}

export function Page({ title, hideTitleOnPhone = false, children }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Remidy`;
  }, [title]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className={cn('text-3xl font-bold tracking-tight', hideTitleOnPhone && 'max-md:sr-only')}>
        {title}
      </h1>
      {children}
    </div>
  );
}
