import type { AgendaEntry } from '@remidy/contracts';
import { addDays, formatMoney, sumCents, type CalendarDate, type Cents } from '@remidy/domain';

interface MonthSummaryProps {
  overdue: AgendaEntry[];
  upcoming: AgendaEntry[];
  today: CalendarDate;
  /** Payments made this month, or null while loading. */
  paidThisMonth: number | null;
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** The total of the known amounts, and how many vary, since a varying bill has no amount yet. */
function total(entries: AgendaEntry[]): string {
  const known = entries.filter((entry) => entry.expectedCents !== null);
  const varies = entries.length - known.length;
  const sum = formatMoney(sumCents(known.map((entry) => entry.expectedCents as Cents)));
  return varies > 0 ? `${sum} + ${plural(varies, 'that varies', 'that vary')}` : sum;
}

/** The month at a glance: what's left to pay, what's late, and what's coming up soon. */
export function MonthSummary({ overdue, upcoming, today, paidThisMonth }: MonthSummaryProps) {
  const month = today.slice(0, 7);
  const open = upcoming.filter((entry) => entry.state === 'open');
  const owed = (entries: AgendaEntry[]) =>
    entries.map((entry) => ({
      ...entry,
      expectedCents: entry.isVariable
        ? entry.expectedCents
        : Math.max(0, (entry.expectedCents ?? 0) - entry.paidCents),
    }));
  const restOfMonth = open.filter((entry) => entry.dueOn.startsWith(month));
  const soon = open.filter((entry) => entry.dueOn <= addDays(today, 7));
  const leftThisMonth = owed([...overdue, ...restOfMonth]);

  const rows = [
    {
      label: 'Paid this month',
      value: paidThisMonth === null ? '…' : formatMoney(paidThisMonth as Cents),
      detail: 'Payments made since the 1st',
      paid: true,
    },
    {
      label: 'Left to pay this month',
      value: leftThisMonth.length > 0 ? total(leftThisMonth) : 'Nothing',
      detail: plural(leftThisMonth.length, 'bill', 'bills'),
    },
    {
      label: 'Overdue',
      value: overdue.length > 0 ? total(owed(overdue)) : 'None',
      detail: plural(overdue.length, 'bill', 'bills'),
      warn: overdue.length > 0,
    },
    {
      label: 'Due in the next 7 days',
      value: soon.length > 0 ? total(owed(soon)) : 'Nothing',
      detail: plural(soon.length, 'bill', 'bills'),
    },
  ];

  return (
    <section
      aria-labelledby="month-summary"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <h2 id="month-summary" className="text-lg font-semibold">
        This month
      </h2>
      <dl className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <dt className="text-sm text-ink-2">{row.label}</dt>
            <dd
              className={`text-xl font-semibold tabular-nums ${row.warn ? 'text-danger' : ''} ${row.paid ? 'text-paid' : ''}`}
            >
              {row.value}
            </dd>
            <dd className="text-sm text-ink-2">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
