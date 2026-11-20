import { formatDate, type CalendarDate } from '@remidy/domain';
import { cn } from '../../../ui/index.ts';
import type { MonthTotals } from './monthTotals.ts';

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className={cn('font-semibold break-words tabular-nums', tone)}>{value}</dd>
    </div>
  );
}

/** What the month on the Calendar adds up to, following the month shown. */
export function CalendarTotals({ month, totals }: { month: CalendarDate; totals: MonthTotals }) {
  return (
    // Named rather than headed, so the month's name stays the page's only heading under its title.
    <section aria-label={`${formatDate(month, 'monthYear')} totals`}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:flex sm:flex-wrap sm:gap-x-10">
        <Total label="Due" value={totals.due} />
        <Total label="Paid" value={totals.paid} tone="text-paid" />
        <Total label="Left to pay" value={totals.left} />
        {/* Named as well as colored, so it's not shown by color alone. */}
        <Total
          label="Overdue"
          value={totals.overdue}
          {...(totals.overdueCount > 0 ? { tone: 'text-danger' } : {})}
        />
      </dl>
    </section>
  );
}
