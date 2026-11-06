import { useEffect, type ReactNode } from 'react';

/** The heading and browser tab title that every page shares. */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Remidy`;
  }, [title]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
