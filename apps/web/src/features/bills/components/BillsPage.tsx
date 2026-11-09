import { Plus } from 'lucide-react';
import { describeSchedule, type Schedule } from '@remidy/domain';
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
  LogoTile,
  Table,
  toast,
  type TableColumn,
} from '../../../ui/index.ts';
import { AGENDA_KEY, BILLS_KEY, fetchBills, logoUrl, type Bill } from '../api.ts';
import { BillForm } from './BillForm.tsx';
import { BillViewer } from './BillViewer.tsx';
import { amountText, nextDue } from './billText.ts';

const nameCell = (bill: Bill) => (
  <span className="flex items-center gap-3">
    <LogoTile src={logoUrl(bill.logoId)} name={bill.name} />
    <span className="flex flex-col">
      <span className="font-semibold">{bill.name}</span>
      {bill.merchant || bill.categoryName ? (
        <span className="text-sm text-ink-2">
          {[bill.merchant, bill.categoryName].filter(Boolean).join(' · ')}
        </span>
      ) : null}
    </span>
  </span>
);

/** Every bill the person sees, personal and shared, with a way to add and edit them. */
export function BillsPage() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  const bills = useQuery({ queryKey: BILLS_KEY, queryFn: ({ signal }) => fetchBills(signal) });
  // Only for adding: an existing bill is edited from its preview.
  const [adding, setAdding] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function changed(message: string) {
    toast(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: BILLS_KEY }),
      queryClient.invalidateQueries({ queryKey: AGENDA_KEY }),
    ]);
  }

  const open = (bill: Bill) => {
    setViewingId(bill.id);
  };
  const startAdding = () => {
    setAdding(true);
  };
  const add = <Button onClick={startAdding}>Add bill</Button>;

  const columns: TableColumn<Bill>[] = [
    { key: 'name', header: 'Name', cell: nameCell },
    {
      key: 'schedule',
      header: 'Schedule',
      cell: (bill) => describeSchedule(bill.schedule as Schedule),
    },
    { key: 'next', header: 'Next due', cell: nextDue },
    ...(household
      ? [
          {
            key: 'whose',
            header: 'Whose',
            cell: (bill: Bill) => (bill.shared ? 'Shared' : 'Personal'),
          },
        ]
      : []),
    { key: 'autopay', header: 'Auto-pay', cell: (bill) => (bill.autopay ? 'Yes' : '') },
    { key: 'amount', header: 'Amount', numeric: true, cell: amountText },
  ];

  /** A table on wider screens, and a list on phones, where columns don't fit. */
  const billList = (label: string, items: Bill[]) => (
    <>
      <div className="hidden md:block">
        <Table
          label={label}
          columns={columns}
          rows={items}
          rowKey={(bill) => bill.id}
          onRowClick={open}
        />
      </div>
      <div className="md:hidden">
        <List label={label}>
          {items.map((bill) => (
            <ListRow
              key={bill.id}
              title={bill.name}
              start={<LogoTile src={logoUrl(bill.logoId)} name={bill.name} />}
              subtitle={[
                bill.merchant,
                describeSchedule(bill.schedule as Schedule),
                bill.categoryName,
                household ? (bill.shared ? 'Shared' : 'Personal') : null,
                bill.autopay ? 'Auto-pay' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              end={<span className="font-semibold tabular-nums">{amountText(bill)}</span>}
              onClick={() => {
                open(bill);
              }}
            />
          ))}
        </List>
      </div>
    </>
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
            fillPage={archived.length === 0}
          />
        ) : (
          billList('Bills', active)
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
            {showArchived ? billList('Archived bills', archived) : null}
          </>
        ) : null}
      </div>
    );
  }

  const hasBills = Boolean(bills.data?.some((bill) => !bill.archived));
  return (
    <Page
      title="Bills"
      hideTitleOnPhone
      // On a phone it floats over the list instead, below.
      actions={hasBills ? <div className="max-md:hidden">{add}</div> : undefined}
    >
      {/* Room at the end, so the floating button never covers the last bill. */}
      <div className="max-md:pb-16">{body}</div>
      {hasBills ? (
        <Button
          aria-label="Add bill"
          title="Add bill"
          onClick={startAdding}
          className="fixed right-4 bottom-24 z-10 size-14 rounded-full px-0 shadow-lg md:hidden"
        >
          <Plus aria-hidden="true" className="size-6" />
        </Button>
      ) : null}
      {viewingId ? (
        <BillViewer
          billId={viewingId}
          onClose={() => {
            setViewingId(null);
          }}
        />
      ) : null}
      {adding ? (
        <BillForm
          bill={null}
          onClose={() => {
            setAdding(false);
          }}
          onChanged={changed}
        />
      ) : null}
    </Page>
  );
}
