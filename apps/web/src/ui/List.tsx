import type { ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

interface ListProps {
  label: string;
  children: ReactNode;
  /**
   * For short items, such as category names: they flow into columns on wider screens instead of
   * one long, mostly empty list.
   */
  columns?: boolean;
}

export function List({ label, children, columns = false }: ListProps) {
  return (
    <ul
      aria-label={label}
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-surface',
        columns
          ? 'grid grid-cols-1 gap-px bg-line sm:grid-cols-2 xl:grid-cols-3 [&>li]:bg-surface'
          : 'flex flex-col divide-y divide-line',
      )}
    >
      {children}
    </ul>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading content, such as an icon. */
  start?: ReactNode;
  /** Trailing content, such as an amount or status. */
  end?: ReactNode;
  /** Makes the whole row a button. */
  onClick?: () => void;
}

export function ListRow({ title, subtitle, start, end, onClick }: ListRowProps) {
  const content = (
    <>
      {start ? <span className="flex-none">{start}</span> : null}
      <span className="flex min-w-0 flex-auto flex-col">
        <span className="font-semibold">{title}</span>
        {subtitle ? <span className="text-sm text-ink-2">{subtitle}</span> : null}
      </span>
      {end ? <span className="flex-none">{end}</span> : null}
    </>
  );
  const rowStyles = 'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left';

  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(rowStyles, 'cursor-pointer -outline-offset-2', focusRing)}
        >
          {content}
        </button>
      ) : (
        <div className={rowStyles}>{content}</div>
      )}
    </li>
  );
}
