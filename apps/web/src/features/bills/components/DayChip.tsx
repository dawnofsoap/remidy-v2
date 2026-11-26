import type { AgendaEntry } from '@remidy/contracts';
import type { CalendarDate } from '@remidy/domain';
import { Zap } from 'lucide-react';
import { Button, cn, LogoTile } from '../../../ui/index.ts';
import { logoUrl } from '../api.ts';
import { DAY_STATUS, dayStatusOf } from './dayStatus.ts';
import { dueSummary } from './dueStatus.ts';

/**
 * One bill on a day in the grid: its logo and status, and its name when names are shown. Without
 * a name, it says the name when pointed at and to screen readers.
 */
export function DayChip({
  entry,
  now,
  names,
  onOpen,
}: {
  entry: AgendaEntry;
  now: CalendarDate;
  names: boolean;
  onOpen: () => void;
}) {
  const status = DAY_STATUS[dayStatusOf(entry, now)];
  const Icon = status.icon;
  const autopay = entry.autopay ? ', auto-pay' : '';
  const label = `${entry.name}, ${status.label}${autopay}`;
  const hint = `${entry.name}: ${dueSummary(entry, now)}${autopay}`;
  if (!names) {
    return (
      <Button
        variant="ghost"
        size="small"
        aria-label={label}
        title={hint}
        onClick={onOpen}
        className={cn(
          'relative z-10 size-9 flex-none rounded-lg p-0',
          (status === DAY_STATUS.paid || status === DAY_STATUS.skipped) && 'opacity-60',
        )}
      >
        <LogoTile src={logoUrl(entry.logoId)} name={entry.name} />
        {entry.autopay ? (
          // Auto-pay on the opposite corner from the status. It's in the label and hint too.
          <span
            aria-hidden="true"
            className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full border border-line bg-surface text-ink"
          >
            <Zap className="size-2.5 fill-current" />
          </span>
        ) : null}
        {Icon ? (
          // Color alone isn't enough, so the status's icon sits on the logo's corner.
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface',
              status.text,
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="small"
      className={cn('relative z-10 w-full justify-start gap-1.5 px-1.5', status.chip)}
      aria-label={label}
      title={hint}
      onClick={onOpen}
    >
      <LogoTile size="small" src={logoUrl(entry.logoId)} name={entry.name} />
      <span className="min-w-0 flex-auto truncate text-left">{entry.name}</span>
      {entry.autopay ? (
        <Zap aria-hidden="true" className="size-3.5 flex-none fill-current" />
      ) : null}
      {Icon ? <Icon aria-hidden="true" className="size-4 flex-none" /> : null}
    </Button>
  );
}
