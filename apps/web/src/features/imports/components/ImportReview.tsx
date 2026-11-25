import type { ImportPreviewBill, ImportPreviewResponse } from '@remidy/contracts';
import { formatDate, formatMoney, parseCalendarDate, toCents } from '@remidy/domain';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button, Checkbox, SelectField } from '../../../ui/index.ts';

interface Choice {
  include: boolean;
  shared: boolean;
}

interface ImportReviewProps {
  preview: ImportPreviewResponse;
  /** Whether the person may add bills to their household. */
  canAddToHousehold: boolean;
  onImport: (choices: { index: number; shared: boolean }[]) => Promise<void>;
  onCancel: () => void;
}

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

function amountOf(bill: ImportPreviewBill): string {
  if (bill.expectedCents === null) return 'Varies';
  const money = formatMoney(toCents(bill.expectedCents));
  return bill.isVariable ? `About ${money}` : money;
}

/** Why a bill isn't chosen to start with, or when it's next due. */
function statusOf(bill: ImportPreviewBill): string | null {
  switch (bill.status) {
    case 'duplicate':
      return 'A bill with this name is already in v2, so it’s left out unless you include it.';
    case 'finished':
      return 'It has no due dates left, so it’s left out unless you include it.';
    case 'archived':
      return 'Stopped in v1. If you include it, it arrives archived.';
    case 'ready': {
      const next = bill.nextDue ? parseCalendarDate(bill.nextDue) : null;
      return next ? `Next due ${formatDate(next)}` : null;
    }
  }
}

function BillChoice({
  bill,
  choice,
  household,
  onChange,
}: {
  bill: ImportPreviewBill;
  choice: Choice;
  /** Whether to offer the household, and whether it can be chosen. */
  household: 'none' | 'allowed' | 'not-allowed';
  onChange: (choice: Choice) => void;
}) {
  const status = statusOf(bill);
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <Checkbox
        label={bill.name}
        checked={choice.include}
        onChange={(include) => {
          onChange({ ...choice, include });
        }}
        description={
          <>
            <span className="block">
              {amountOf(bill)} · {bill.scheduleText}
              {bill.categoryName ? ` · ${bill.categoryName}` : ''}
              {bill.autopay ? ' · Auto‑pay' : ''}
            </span>
            {status ? <span className="block">{status}</span> : null}
            {bill.checks.map((check) => (
              <span key={check} className="mt-1 flex items-start gap-1.5 text-ink">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" />
                {check}
              </span>
            ))}
          </>
        }
      />
      {household === 'none' ? null : (
        <SelectField
          label="Goes to"
          aria-label={`Where ${bill.name} goes`}
          className="sm:w-40"
          value={choice.shared ? 'household' : 'personal'}
          disabled={!choice.include}
          onChange={(event) => {
            onChange({ ...choice, shared: event.target.value === 'household' });
          }}
        >
          <option value="personal">Just you</option>
          {household === 'allowed' ? <option value="household">Household</option> : null}
        </SelectField>
      )}
    </li>
  );
}

/** Everything the export holds, to choose from before anything is saved. */
export function ImportReview({
  preview,
  canAddToHousehold,
  onImport,
  onCancel,
}: ImportReviewProps) {
  const household = !preview.hasHousehold ? 'none' : canAddToHousehold ? 'allowed' : 'not-allowed';
  const [choices, setChoices] = useState<Map<number, Choice>>(
    () =>
      new Map(
        preview.bills.map((bill) => [
          bill.index,
          { include: bill.status === 'ready', shared: bill.shared && household === 'allowed' },
        ]),
      ),
  );
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = preview.bills.flatMap((bill) => {
    const choice = choices.get(bill.index);
    return choice?.include ? [{ index: bill.index, shared: choice.shared }] : [];
  });
  const newCategories = preview.categories.filter((category) => !category.exists);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await onImport(chosen);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The import didn’t finish.');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p>
        The export holds {plural(preview.bills.length, 'bill', 'bills')} v2 can import. Choose which
        to bring over. Their due dates start today, since earlier ones were paid in v1.
      </p>
      {household === 'not-allowed' ? (
        <p className="text-sm text-ink-2">
          Only a household’s managers can add its bills, so they all come to you. You can move them
          later.
        </p>
      ) : null}

      {preview.bills.length > 0 ? (
        <ul
          aria-label="Bills in the export"
          className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface"
        >
          {preview.bills.map((bill) => (
            <BillChoice
              key={bill.index}
              bill={bill}
              household={household}
              choice={choices.get(bill.index) ?? { include: false, shared: false }}
              onChange={(choice) => {
                setChoices((current) => new Map(current).set(bill.index, choice));
              }}
            />
          ))}
        </ul>
      ) : null}

      {newCategories.length > 0 ? (
        <p>
          <span className="font-semibold">New categories:</span>{' '}
          {newCategories.map((category) => category.name).join(', ')}
        </p>
      ) : null}

      {preview.skipped.length > 0 ? (
        <section aria-labelledby="import-skipped" className="flex flex-col gap-2">
          <h3 id="import-skipped" className="font-semibold">
            Can’t be imported ({String(preview.skipped.length)})
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {preview.skipped.map((item, index) => (
              <li key={`${item.name}-${String(index)}`}>
                <span className="font-semibold">{item.name}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {problem ? (
        <p role="alert" className="font-semibold text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={chosen.length === 0 || saving} onClick={() => void save()}>
          {saving ? 'Importing…' : `Import ${plural(chosen.length, 'bill', 'bills')}`}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Choose another file
        </Button>
      </div>
    </div>
  );
}
