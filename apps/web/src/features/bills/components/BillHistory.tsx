import type { HistoryEntry, PaymentResponse } from '@remidy/contracts';
import { formatDate, formatMoney, type CalendarDate, type Cents } from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { Button, ErrorState, LoadingState, TextField } from '../../../ui/index.ts';
import { fetchHistory, HISTORY_KEY, voidPayment, type Bill } from '../api.ts';
import { useRefresh } from '../useRefresh.ts';
import { PaySheet } from './PaySheet.tsx';

const STATE_TEXT = { open: 'Open', settled: 'Paid', skipped: 'Skipped' } as const;

function PaymentLine({ spaceId, payment }: { spaceId: string; payment: PaymentResponse }) {
  const refresh = useRefresh();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmVoid() {
    if (!reason.trim()) {
      setProblem('Say why it’s being voided.');
      return;
    }
    setBusy(true);
    try {
      await voidPayment(spaceId, payment.id, reason.trim());
      await refresh('Payment voided. It stays in the history.');
    } catch (error) {
      setProblem(error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const who =
    payment.source === 'autopay'
      ? 'Auto-pay'
      : payment.paidByName
        ? `by ${payment.paidByName}`
        : '';
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={payment.voided ? 'text-ink-2 line-through' : ''}>
          <span className="font-semibold tabular-nums">
            {formatMoney(payment.amountCents as Cents)}
          </span>{' '}
          on {formatDate(payment.paidOn as CalendarDate)} {who}
          {payment.confirmation ? ` · #${payment.confirmation}` : ''}
        </span>
        {!payment.voided && !voiding ? (
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              setVoiding(true);
            }}
          >
            Void…
          </Button>
        ) : null}
      </div>
      {payment.voided ? (
        <p className="text-sm text-ink-2">
          Voided{payment.voidedByName ? ` by ${payment.voidedByName}` : ''}: {payment.voidReason}
        </p>
      ) : null}
      {payment.notes ? <p className="text-sm text-ink-2">{payment.notes}</p> : null}
      {voiding ? (
        <div className="flex flex-col gap-2">
          <TextField
            label="Why void it?"
            hint="It stays in the history, marked void, so the record shows what happened."
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setProblem(null);
            }}
            {...(problem ? { error: problem } : {})}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setVoiding(false);
              }}
            >
              Keep it
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void confirmVoid()}>
              Void payment
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Every due date of a bill, newest first, with its payments, voids and skips. */
export function BillHistory({ bill }: { bill: Bill }) {
  const history = useQuery({
    queryKey: HISTORY_KEY(bill.id),
    queryFn: ({ signal }) => fetchHistory(bill.spaceId, bill.id, signal),
  });
  const refresh = useRefresh();
  const [paying, setPaying] = useState<HistoryEntry | null>(null);

  if (history.isPending) return <LoadingState label="Loading history" />;
  if (history.isError) {
    return <ErrorState message="History couldn’t load." onRetry={() => void history.refetch()} />;
  }
  if (history.data.length === 0) return <p className="text-ink-2">No due dates yet.</p>;

  return (
    <>
      <ol aria-label="Due dates" className="flex flex-col divide-y divide-line">
        {history.data.map((due) => {
          const paid = due.payments
            .filter((payment) => !payment.voided)
            .reduce((sum, payment) => sum + payment.amountCents, 0);
          return (
            <li key={due.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {formatDate(due.dueOn as CalendarDate)}
                  <span className="ml-2 text-sm font-normal text-ink-2">
                    {STATE_TEXT[due.state]}
                    {due.expectedCents === null
                      ? ''
                      : ` · ${formatMoney(due.expectedCents as Cents)} expected`}
                  </span>
                </span>
                {due.state !== 'settled' ? (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      setPaying(due);
                    }}
                  >
                    {due.state === 'skipped' ? 'Un-skip' : 'Pay'}
                  </Button>
                ) : null}
              </div>
              {due.payments.length > 0 ? (
                <ul aria-label={`Payments for ${formatDate(due.dueOn as CalendarDate)}`}>
                  {due.payments.map((payment) => (
                    <PaymentLine key={payment.id} spaceId={bill.spaceId} payment={payment} />
                  ))}
                </ul>
              ) : null}
              {paid > 0 && due.state === 'open' ? (
                <p className="text-sm text-ink-2">{formatMoney(paid as Cents)} paid so far</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {paying ? (
        <PaySheet
          entry={{
            id: paying.id,
            spaceId: bill.spaceId,
            name: bill.name,
            dueOn: paying.dueOn,
            expectedCents: paying.expectedCents,
            isVariable: paying.isVariable,
            state: paying.state,
            paidCents: paying.payments
              .filter((payment) => !payment.voided)
              .reduce((sum, payment) => sum + payment.amountCents, 0),
          }}
          onClose={() => {
            setPaying(null);
          }}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}
