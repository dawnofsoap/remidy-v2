import type { AgendaEntry } from '@remidy/contracts';
import { formatDate, type CalendarDate } from '@remidy/domain';
import { cn, List, ListRow, LogoTile, Modal } from '../../../ui/index.ts';
import { logoUrl } from '../api.ts';
import { byUrgency, DAY_STATUS, dayStatusOf } from './dayStatus.ts';
import { statusOf } from './dueStatus.ts';

interface DaySheetProps {
  day: CalendarDate;
  entries: AgendaEntry[];
  today: CalendarDate;
  onClose: () => void;
  onOpen: (entry: AgendaEntry) => void;
}

/** Every bill due on one day, for when the calendar can't fit them all. */
export function DaySheet({ day, entries, today, onClose, onOpen }: DaySheetProps) {
  const title = formatDate(day, 'long');
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={entries.length === 0 ? 'Nothing is due this day.' : 'What’s due this day.'}
      hideDescription={entries.length > 0}
    >
      {entries.length > 0 ? (
        <List label={title}>
          {byUrgency(entries, today).map((entry) => {
            const status = DAY_STATUS[dayStatusOf(entry, today)];
            const amount = statusOf(entry, false);
            return (
              <ListRow
                key={entry.id}
                title={entry.name}
                subtitle={status.label}
                start={<LogoTile src={logoUrl(entry.logoId)} name={entry.name} />}
                end={
                  <span className={cn('font-semibold tabular-nums', status.text)}>
                    {amount.text}
                  </span>
                }
                onClick={() => {
                  onOpen(entry);
                }}
              />
            );
          })}
        </List>
      ) : null}
    </Modal>
  );
}
