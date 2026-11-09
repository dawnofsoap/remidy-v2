import type { PaymentListEntry } from '@remidy/contracts';
import { formatDate, formatMoney, sumCents, type CalendarDate, type Cents } from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { ErrorState, ListRow, LogoTile } from '../../../ui/index.ts';
import { fetchPayments, logoUrl, PAYMENTS_KEY } from '../api.ts';
import { CardList, HomeCard } from './HomeCard.tsx';

interface MonthPaymentsProps {
  /** The first of this month. */
  from: CalendarDate;
  today: CalendarDate;
  showOwner: boolean;
  className?: string;
  onOpen: (payment: PaymentListEntry) => void;
}

/** What's been paid since the 1st, newest first, with the total, which matches Paid this month. */
export function MonthPayments({ from, today, showOwner, className, onOpen }: MonthPaymentsProps) {
  const payments = useQuery({
    queryKey: [...PAYMENTS_KEY, from, today],
    queryFn: ({ signal }) => fetchPayments(from, today, signal),
  });
  const month = formatDate(from, 'month');
  const total = payments.data
    ? formatMoney(sumCents(payments.data.map((entry) => entry.amountCents as Cents)))
    : null;

  return (
    <HomeCard title={`Paid in ${month}`} icon={CircleCheck} aside={total} className={className}>
      {payments.isPending ? (
        <div role="status" aria-label="Loading payments" className="h-24 animate-pulse" />
      ) : payments.isError ? (
        <div className="p-4">
          <ErrorState message="Payments couldn’t load." onRetry={() => void payments.refetch()} />
        </div>
      ) : (
        <CardList
          label={`Paid in ${month}`}
          items={payments.data}
          shown={6}
          columns
          empty={`Nothing paid yet in ${month}.`}
          render={(entry) => (
            <ListRow
              key={entry.id}
              title={entry.name}
              start={<LogoTile src={logoUrl(entry.logoId)} name={entry.name} />}
              subtitle={[
                formatDate(entry.paidOn as CalendarDate, 'short'),
                entry.source === 'autopay'
                  ? 'Auto-pay'
                  : entry.paidByName
                    ? `by ${entry.paidByName}`
                    : null,
                showOwner ? (entry.shared ? 'Shared' : 'Personal') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              end={
                <span className="font-semibold text-paid tabular-nums">
                  {formatMoney(entry.amountCents as Cents)}
                </span>
              }
              onClick={() => {
                onOpen(entry);
              }}
            />
          )}
        />
      )}
    </HomeCard>
  );
}
