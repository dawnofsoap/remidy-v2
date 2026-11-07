import { PAYMENT_NOTES_MAX } from '@remidy/contracts';
import { formatDate, formatMoney, today, type CalendarDate, type Cents } from '@remidy/domain';
import { useState, type SyntheticEvent } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { Button, DateField, Modal, MoneyField, TextField } from '../../../ui/index.ts';
import { recordPayment, setSkipped } from '../api.ts';
import { remaining, type DueEntry } from './dueStatus.ts';

interface PaySheetProps {
  entry: DueEntry;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}

const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** Records a payment toward one due date, or skips it when it won't be charged. */
export function PaySheet({ entry, onClose, onChanged }: PaySheetProps) {
  const owed = remaining(entry);
  const [cents, setCents] = useState<Cents | null>(owed && owed > 0 ? (owed as Cents) : null);
  const [paidOn, setPaidOn] = useState<CalendarDate | null>(browserToday());
  const [confirmation, setConfirmation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function run(change: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFailure(null);
    try {
      await change();
      await onChanged(message);
      onClose();
    } catch (error) {
      if (error instanceof RequestFailure && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      } else {
        setFailure(
          error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function save(event: SyntheticEvent) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (cents === null || cents <= 0) problems.amountCents = 'Enter the amount paid.';
    if (!paidOn) problems.paidOn = 'Enter the date it was paid.';
    setErrors(problems);
    if (Object.keys(problems).length > 0 || cents === null || !paidOn) return;
    void run(
      () =>
        recordPayment(entry.spaceId, entry.id, {
          paidOn,
          amountCents: cents,
          confirmation: confirmation.trim() || null,
          notes: notes.trim() || null,
        }),
      `Recorded ${formatMoney(cents)} for ${entry.name}.`,
    );
  }

  const err = (key: string) => (errors[key] ? { error: errors[key] } : {});
  const due = formatDate(entry.dueOn as CalendarDate, 'long');
  const skipped = entry.state === 'skipped';

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={skipped ? entry.name : `Pay ${entry.name}`}
      description={
        entry.paidCents > 0
          ? `Due ${due}. ${formatMoney(entry.paidCents as Cents)} paid so far.`
          : `Due ${due}.`
      }
    >
      {skipped ? (
        <div className="flex flex-col gap-3">
          <p>This due date was skipped, so nothing is owed for it.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              busy={busy}
              onClick={() => {
                void run(
                  () => setSkipped(entry.spaceId, entry.id, false),
                  `Un-skipped ${entry.name}.`,
                );
              }}
            >
              Un-skip
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <MoneyField
            label="Amount paid"
            {...(entry.isVariable ? { hint: 'This bill varies, so enter what was charged.' } : {})}
            cents={cents}
            onCentsChange={setCents}
            {...err('amountCents')}
          />
          <DateField
            label="Date paid"
            date={paidOn}
            max={browserToday()}
            onDateChange={setPaidOn}
            {...err('paidOn')}
          />
          <TextField
            label="Confirmation number (optional)"
            value={confirmation}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => {
              setConfirmation(event.target.value);
            }}
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            maxLength={PAYMENT_NOTES_MAX}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
          {failure ? (
            <p role="alert" className="text-danger">
              {failure}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {entry.paidCents === 0 ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void run(
                    () => setSkipped(entry.spaceId, entry.id, true),
                    `Skipped ${entry.name}.`,
                  );
                }}
              >
                Skip this one
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                Save payment
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
