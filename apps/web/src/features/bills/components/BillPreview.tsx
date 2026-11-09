import { describeSchedule, type Schedule } from '@remidy/domain';
import type { ReactNode } from 'react';
import { useHousehold } from '../../../core/space.tsx';
import { Button, cn, LogoTile, Modal } from '../../../ui/index.ts';
import { logoUrl, type Bill } from '../api.ts';
import { BillHistory } from './BillHistory.tsx';
import { amountText, nextDue } from './billText.ts';

interface BillPreviewProps {
  bill: Bill;
  onEdit: () => void;
  onClose: () => void;
}

function Fact({
  label,
  wide = false,
  children,
}: {
  label: string;
  /** Takes the whole row, for longer text. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', wide && 'sm:col-span-2')}>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/**
 * A bill as it is, with its due dates and payments. Nothing changes until the person chooses Edit,
 * so opening a bill to look at it can't alter it by accident.
 */
export function BillPreview({ bill, onEdit, onClose }: BillPreviewProps) {
  const household = useHousehold();
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bill.name}
      description={bill.merchant ?? 'A bill you pay on a schedule.'}
      hideDescription
    >
      <div className="flex items-center gap-3">
        <LogoTile size="large" src={logoUrl(bill.logoId)} name={bill.name} />
        <div className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold tabular-nums">{amountText(bill)}</span>
          <span className="text-sm text-ink-2">
            {[
              bill.merchant,
              household ? (bill.shared ? `Shared with ${household.name}` : 'Personal') : null,
              bill.archived ? 'Archived' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Repeats">{describeSchedule(bill.schedule as Schedule)}</Fact>
        <Fact label="Next due">{nextDue(bill)}</Fact>
        <Fact label="Category">{bill.categoryName ?? 'None'}</Fact>
        <Fact label="Paid automatically">{bill.autopay ? 'Yes, auto-pay' : 'No'}</Fact>
        {bill.url ? (
          <Fact label="Website">
            <a
              href={bill.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text underline"
            >
              {new URL(bill.url).host}
            </a>
          </Fact>
        ) : null}
        {bill.notes ? (
          <Fact label="Notes" wide>
            <span className="whitespace-pre-line">{bill.notes}</span>
          </Fact>
        ) : null}
      </dl>
      <section aria-label="History" className="flex flex-col gap-1 border-t border-line pt-4">
        <h3 className="font-semibold">History</h3>
        <BillHistory bill={bill} />
      </section>
      {/* Stays in view while the history scrolls. */}
      <div className="sticky -bottom-6 -mx-6 flex items-center justify-between gap-2 border-t border-line bg-surface px-6 py-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onEdit}>Edit</Button>
      </div>
    </Modal>
  );
}
