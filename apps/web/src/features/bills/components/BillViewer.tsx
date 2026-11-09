import type { AgendaEntry } from '@remidy/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BILLS_KEY, fetchBills } from '../api.ts';
import { useRefresh } from '../useRefresh.ts';
import { BillForm } from './BillForm.tsx';
import { BillPreview } from './BillPreview.tsx';
import { PaySheet } from './PaySheet.tsx';

interface BillViewerProps {
  billId: string;
  /** The due date it was opened from, such as a day on the calendar, which can be paid from it. */
  due?: AgendaEntry | null;
  onClose: () => void;
}

/**
 * A bill opened from anywhere: its preview first, then editing or paying when asked, each going
 * back to the preview when done. Archiving or deleting it closes everything.
 */
export function BillViewer({ billId, due = null, onClose }: BillViewerProps) {
  // Read from the list each time, so it shows a change as soon as it's saved.
  const bills = useQuery({ queryKey: BILLS_KEY, queryFn: ({ signal }) => fetchBills(signal) });
  const bill = bills.data?.find((candidate) => candidate.id === billId) ?? null;
  const refresh = useRefresh();
  const [mode, setMode] = useState<'preview' | 'edit' | 'pay'>('preview');
  const back = () => {
    setMode('preview');
  };

  // A bill that's gone, such as one deleted elsewhere, has nothing to show.
  const missing = bills.isSuccess && bill === null;
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);

  if (!bill) return null;
  if (mode === 'edit') {
    return <BillForm bill={bill} onClose={back} onChanged={refresh} />;
  }
  if (mode === 'pay' && due) {
    return <PaySheet entry={due} onClose={back} onChanged={refresh} />;
  }
  return (
    <BillPreview
      bill={bill}
      due={due}
      onEdit={() => {
        setMode('edit');
      }}
      onPay={() => {
        setMode('pay');
      }}
      onRemoved={onClose}
      onChanged={refresh}
      onClose={onClose}
    />
  );
}
