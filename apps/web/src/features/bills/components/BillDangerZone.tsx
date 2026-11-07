import { useState } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { Button } from '../../../ui/index.ts';
import { deleteBill, updateBill, type Bill } from '../api.ts';

interface BillDangerZoneProps {
  bill: Bill;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}

/** Archive, restore and delete, kept apart from saving so they aren't pressed by accident. */
export function BillDangerZone({ bill, onClose, onChanged }: BillDangerZoneProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(change: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFailure(null);
    try {
      await change();
      await onChanged(message);
      onClose();
    } catch (error) {
      setFailure(error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      {failure ? (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      ) : null}
      {confirming ? (
        <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3">
          <p>
            Delete <strong>{bill.name}</strong> and its due dates? This can’t be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={() =>
                void run(() => deleteBill(bill.spaceId, bill.id), `Deleted ${bill.name}.`)
              }
            >
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(
                  () => updateBill(bill.spaceId, bill.id, { archived: !bill.archived }),
                  bill.archived ? `Restored ${bill.name}.` : `Archived ${bill.name}.`,
                )
              }
            >
              {bill.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete…
            </Button>
          </div>
          {!bill.archived ? (
            <p className="text-sm text-ink-2">Archiving stops new due dates but keeps the past.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
