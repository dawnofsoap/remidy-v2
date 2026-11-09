import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { Button } from '../../../ui/index.ts';
import { deleteBill, updateBill, type Bill } from '../api.ts';

interface BillActionsProps {
  bill: Bill;
  /** Edit is the main action, unless there's a due date to pay. */
  editIsMain: boolean;
  onEdit: () => void;
  onClose: () => void;
  /** After it's archived, restored or deleted. */
  onRemoved: () => void;
  onChanged: (message: string) => Promise<void>;
}

/**
 * The bar at the bottom of a bill's preview: archive and delete as icons on one side, Close and
 * Edit on the other. Deleting asks first, in the bar itself, so it can't be done by accident.
 */
export function BillActions({
  bill,
  editIsMain,
  onEdit,
  onClose,
  onRemoved,
  onChanged,
}: BillActionsProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(change: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFailure(null);
    try {
      await change();
      await onChanged(message);
      onRemoved();
    } catch (error) {
      setFailure(error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const archive = bill.archived
    ? { label: 'Restore', hint: 'Restore: due dates start again', Icon: ArchiveRestore }
    : { label: 'Archive', hint: 'Archive: no new due dates, but the past is kept', Icon: Archive };

  return (
    <div className="flex flex-col gap-3">
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
              <Trash2 aria-hidden="true" className="size-5" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label={archive.label}
              title={archive.hint}
              busy={busy}
              onClick={() =>
                void run(
                  () => updateBill(bill.spaceId, bill.id, { archived: !bill.archived }),
                  bill.archived ? `Restored ${bill.name}.` : `Archived ${bill.name}.`,
                )
              }
            >
              <archive.Icon aria-hidden="true" className="size-5" />
            </Button>
            <Button
              variant="danger"
              size="icon"
              aria-label="Delete…"
              title="Delete"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant={editIsMain ? 'primary' : 'secondary'} onClick={onEdit}>
              <Pencil aria-hidden="true" className="size-4" />
              Edit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
