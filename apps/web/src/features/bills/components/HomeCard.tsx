import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button, cn } from '../../../ui/index.ts';

interface HomeCardProps {
  title: string;
  icon?: LucideIcon;
  /** Beside the title, such as a count or a total. */
  aside?: ReactNode;
  tone?: 'danger';
  className?: string;
  children: ReactNode;
}

/** One of Home's cards: a titled box that sizes to what's in it. */
export function HomeCard({ title, icon: Icon, aside, tone, className, children }: HomeCardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface',
        tone === 'danger' ? 'border-danger/40' : 'border-line',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3',
          tone === 'danger' ? 'border-danger/40 bg-danger-soft text-danger' : 'border-line',
        )}
      >
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          {Icon ? <Icon aria-hidden="true" className="size-5" /> : null}
          {title}
        </h2>
        {aside ? <div className="text-sm font-semibold tabular-nums">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

interface CardListProps<T> {
  label: string;
  items: T[];
  /** How many show before "Show N more". */
  shown: number;
  /** Lays the items out in columns where there's room. */
  columns?: boolean;
  render: (item: T) => ReactNode;
  /** Said when there are no items. */
  empty?: string;
}

/**
 * A card's list, showing its first few items and the rest on request. Showing more grows only
 * this card.
 */
export function CardList<T>({
  label,
  items,
  shown,
  columns = false,
  render,
  empty,
}: CardListProps<T>) {
  const [all, setAll] = useState(false);
  const id = useId();
  if (items.length === 0) {
    return empty ? <p className="px-5 py-4 text-ink-2">{empty}</p> : null;
  }
  const visible = all ? items : items.slice(0, shown);
  const hidden = items.length - shown;
  return (
    <>
      <ul
        id={id}
        aria-label={label}
        className={cn(
          // Each item draws its right and bottom lines, and the card clips those on its edges, so
          // an odd number of items leaves no empty cell.
          '-mr-px -mb-px grid [&>li]:border-r [&>li]:border-b [&>li]:border-line',
          columns ? 'grid-cols-1 sm:grid-cols-2 min-[120rem]:grid-cols-3' : 'grid-cols-1',
        )}
      >
        {visible.map(render)}
      </ul>
      {hidden > 0 ? (
        <Button
          variant="ghost"
          aria-expanded={all}
          aria-controls={id}
          className="rounded-none border-t border-line text-ink-2"
          onClick={() => {
            setAll(!all);
          }}
        >
          {all ? (
            <ChevronUp aria-hidden="true" className="size-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4" />
          )}
          {all ? 'Show less' : `Show ${String(hidden)} more`}
        </Button>
      ) : null}
    </>
  );
}
