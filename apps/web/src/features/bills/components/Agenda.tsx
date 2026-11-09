import type { AgendaEntry } from '@remidy/contracts';
import {
  addDays,
  addMonthsFromAnchor,
  dateFromParts,
  datePartsOf,
  formatDate,
  monthEnd,
  today,
  type CalendarDate,
} from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarDays, CircleAlert } from 'lucide-react';
import { useHousehold } from '../../../core/space.tsx';
import { cn, EmptyState, ErrorState, focusRing, ListRow, LogoTile } from '../../../ui/index.ts';
import { AGENDA_KEY, fetchAgenda, fetchTotals, logoUrl, TOTALS_KEY } from '../api.ts';
import { useState } from 'react';
import { statusOf } from './dueStatus.ts';
import { MiniCalendar } from './MiniCalendar.tsx';
import { CardList, HomeCard } from './HomeCard.tsx';
import { homeFigures, plural } from './homeFigures.ts';
import { MonthFigures } from './MonthFigures.tsx';
import { BillViewer } from './BillViewer.tsx';

function monthStart(date: CalendarDate): CalendarDate {
  const { year, month } = datePartsOf(date);
  return dateFromParts(year, month, 1) ?? date;
}

/** One due date in a card's list: its logo, name, date and what's owed. */
function DueRow({
  entry,
  showOwner,
  overdue = false,
  onOpen,
}: {
  entry: AgendaEntry;
  showOwner: boolean;
  overdue?: boolean;
  onOpen: (entry: AgendaEntry) => void;
}) {
  const status = statusOf(entry, overdue);
  return (
    <ListRow
      title={entry.name}
      start={<LogoTile src={logoUrl(entry.logoId)} name={entry.name} />}
      subtitle={[
        formatDate(entry.dueOn as CalendarDate, 'short'),
        entry.categoryName,
        showOwner ? (entry.shared ? 'Shared' : 'Personal') : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      end={<span className={cn('font-semibold tabular-nums', status.tone)}>{status.text}</span>}
      onClick={() => {
        onOpen(entry);
      }}
    />
  );
}

/** While what's due loads, each card holds its place, so the page doesn't jump. */
function Placeholder() {
  const block = 'animate-pulse rounded-2xl border border-line bg-surface';
  return (
    <div role="status" aria-label="Loading what’s due" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className={cn(block, 'h-28')} />
        ))}
      </div>
      <div className={cn(block, 'h-80')} />
    </div>
  );
}

/**
 * Home's cards, about this month: its figures, what's overdue, and the rest of the month beside a
 * small calendar. Later months are on the Calendar page.
 */
export function Agenda() {
  const household = useHousehold();
  const from = today(Intl.DateTimeFormat().resolvedOptions().timeZone);
  // This month, or a week ahead if that's later, for Due in the next 7 days.
  const nextMonth = addMonthsFromAnchor(monthStart(from), 1);
  const weekOn = addDays(from, 8);
  const to = weekOn > nextMonth ? weekOn : nextMonth;
  const agenda = useQuery({
    queryKey: [...AGENDA_KEY, from, to],
    queryFn: ({ signal }) => fetchAgenda(from, to, signal),
  });
  const monthTo = monthEnd(from);
  const totals = useQuery({
    queryKey: [...TOTALS_KEY, monthStart(from), monthTo],
    queryFn: ({ signal }) => fetchTotals(monthStart(from), monthTo, signal),
  });
  // The due date whose bill is open, found in the agenda each time so a payment shows at once.
  const [openId, setOpenId] = useState<string | null>(null);

  if (agenda.isPending) return <Placeholder />;
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
  const figures = homeFigures(overdue, shown, from, totals.data?.paidCents ?? null);
  const restOfMonth = shown.filter((entry) => entry.dueOn.startsWith(thisMonth));
  const opened = [...overdue, ...shown].find((entry) => entry.id === openId) ?? null;
  const open = (entry: AgendaEntry) => {
    setOpenId(entry.id);
  };
  const row = (overdueRow: boolean) => (entry: AgendaEntry) => (
    <DueRow key={entry.id} entry={entry} showOwner={showOwner} overdue={overdueRow} onOpen={open} />
  );
  const monthName = formatDate(`${thisMonth}-01` as CalendarDate, 'month');

  return (
    // Stacked until there's room for columns. What's overdue comes first while stacked.
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-3">
        <MonthFigures figures={figures} />
      </div>
      {overdue.length > 0 ? (
        <HomeCard
          title="Overdue"
          icon={CircleAlert}
          tone="danger"
          aside={`${plural(overdue.length, 'bill', 'bills')} · ${figures.overdue.value}`}
          className="max-xl:order-first xl:col-span-3"
        >
          <CardList label="Overdue" items={overdue} shown={4} columns render={row(true)} />
        </HomeCard>
      ) : null}
      <HomeCard
        title={`${monthName} bills`}
        icon={CalendarDays}
        aside={plural(restOfMonth.length, 'bill', 'bills')}
        className="xl:col-span-2"
      >
        <CardList
          label="Rest of this month"
          items={restOfMonth}
          shown={8}
          columns
          render={row(false)}
          empty={`Nothing else due in ${monthName}.`}
        />
      </HomeCard>
      {/* Only beside the month's bills: stacked on smaller screens, it would push them down. */}
      <div className="hidden xl:block">
        <MiniCalendar today={from} />
      </div>
      {opened ? (
        <BillViewer
          billId={opened.billId}
          due={opened}
          onClose={() => {
            setOpenId(null);
          }}
        />
      ) : null}
    </div>
  );
}
