import { describeSchedule, formatMoney, type Cents, type Schedule } from '@remidy/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '../../../core/Page.tsx';
import { useHousehold } from '../../../core/space.tsx';
import {
  Button,
  EmptyState,
  ErrorState,
  List,
  ListRow,
  LoadingState,
  toast,
} from '../../../ui/index.ts';
import { AGENDA_KEY, BILLS_KEY, fetchBills, type Bill } from '../api.ts';
import { BillForm } from './BillForm.tsx';

export const amountText = (bill: { expectedCents: number | null; isVariable: boolean }) =>
  bill.expectedCents === null
    ? 'Varies'
    : `${formatMoney(bill.expectedCents as Cents)}${bill.isVariable ? ', varies' : ''}`;

/** Every bill the person sees, personal and shared, with a way to add and edit them. */
export function BillsPage() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  const bills = useQuery({ queryKey: BILLS_KEY, queryFn: ({ signal }) => fetchBills(signal) });
  const [editing, setEditing] = useState<{ bill: Bill | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function changed(message: string) {
    toast(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: BILLS_KEY }),
      queryClient.invalidateQueries({ queryKey: AGENDA_KEY }),
    ]);
  }

  const add = (
    <Button
      onClick={() => {
        setEditing({ bill: null });
      }}
    >
      Add bill
    </Button>
  );

  const row = (bill: Bill) => (
    <ListRow
      key={bill.id}
      title={bill.name}
      subtitle={[
        describeSchedule(bill.schedule as Schedule),
        bill.categoryName,
        household ? (bill.shared ? 'Shared' : 'Personal') : null,
        bill.autopay ? 'Auto-pay' : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      end={<span className="font-semibold tabular-nums">{amountText(bill)}</span>}
      onClick={() => {
        setEditing({ bill });
      }}
    />
  );

  let body;
  if (bills.isPending) body = <LoadingState label="Loading bills" />;
  else if (bills.isError) {
    body = <ErrorState message="Bills couldn’t load." onRetry={() => void bills.refetch()} />;
  } else {
    const active = bills.data.filter((bill) => !bill.archived);
    const archived = bills.data.filter((bill) => bill.archived);
    body = (
      <div className="flex flex-col gap-4">
        {active.length === 0 ? (
          <EmptyState
            title="No bills yet"
            description="Add the bills you pay, and Home will show what’s due."
            action={add}
          />
        ) : (
          <>
            <div>{add}</div>
            <List label="Bills">{active.map(row)}</List>
          </>
        )}
        {archived.length > 0 ? (
          <>
            <div>
              <Button
                variant="ghost"
                aria-expanded={showArchived}
                onClick={() => {
                  setShowArchived((shown) => !shown);
                }}
              >
                {showArchived ? 'Hide archived' : `Show archived (${String(archived.length)})`}
              </Button>
            </div>
            {showArchived ? <List label="Archived bills">{archived.map(row)}</List> : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <Page title="Bills">
      {body}
      {editing ? (
        <BillForm
          bill={editing.bill}
          onClose={() => {
            setEditing(null);
          }}
          onChanged={changed}
        />
      ) : null}
    </Page>
  );
}
