import type { AgendaEntry } from '@remidy/contracts';
import {
  addMonthsFromAnchor,
  dateFromParts,
  datePartsOf,
  formatDate,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useHousehold } from '../../../core/space.tsx';
import {
  cn,
  EmptyState,
  ErrorState,
  focusRing,
  List,
  ListRow,
  LoadingState,
} from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda } from '../api.ts';
import { amountText } from './BillsPage.tsx';

const MONTHS_SHOWN = 3;

function monthStart(date: CalendarDate): CalendarDate {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
}

/** Groups due dates by the month they fall in, in order. */
function byMonth(entries: AgendaEntry[]) {
  const groups = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const key = entry.dueOn.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()];
}

function AgendaList({
  label,
  entries,
  showOwner,
}: {
  label: string;
  entries: AgendaEntry[];
  showOwner: boolean;
}) {
  return (
    <List label={label}>
      {entries.map((entry) => (
        <ListRow
          key={entry.id}
          title={entry.name}
          subtitle={[
            formatDate(entry.dueOn as CalendarDate, 'short'),
            entry.categoryName,
            showOwner ? (entry.shared ? 'Shared' : 'Personal') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          end={<span className="font-semibold tabular-nums">{amountText(entry)}</span>}
        />
      ))}
    </List>
  );
}

/** What's overdue, what's left this month, and the next couple of months, across every bill. */
export function Agenda() {
  const household = useHousehold();
  const from = today(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const to = addMonthsFromAnchor(monthStart(from), MONTHS_SHOWN);
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, from, to],
    queryFn: ({ signal }) => fetchAgenda(from, to, signal),
  });

  if (agenda.isPending) return <LoadingState label="Loading what’s due" />;
  if (agenda.isError) {
    return <ErrorState message="What’s due couldn’t load." onRetry={() => void agenda.refetch()} />;
  }

  const { overdue, upcoming } = agenda.data;
  // The range ends on the first of a later month, which belongs to the next view.
  const shown = upcoming.filter((entry) => entry.dueOn < to);
  if (overdue.length === 0 && shown.length === 0) {
    return (
      <EmptyState
        title="Nothing due"
        description="Add the bills you pay, and what’s due will show here."
        fillPage
        action={
          <Link
            to="/bills"
            className={cn(
              'rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent',
              focusRing,
            )}
          >
            Go to Bills
          </Link>
        }
      />
    );
  }

  const thisMonth = from.slice(0, 7);
  const showOwner = Boolean(household);
  return (
    <div className="flex flex-col gap-6">
      {overdue.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-danger">Overdue</h2>
          <AgendaList label="Overdue" entries={overdue} showOwner={showOwner} />
        </section>
      ) : null}
      {byMonth(shown).map(([month, entries]) => {
        const title =
          month === thisMonth
            ? 'Rest of this month'
            : formatDate(`${month}-01` as CalendarDate, 'monthYear');
        return (
          <section key={month} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <AgendaList label={title} entries={entries} showOwner={showOwner} />
          </section>
        );
      })}
    </div>
  );
}
