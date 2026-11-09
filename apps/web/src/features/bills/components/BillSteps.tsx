import { BILL_MERCHANT_MAX, BILL_NAME_MAX, BILL_NOTES_MAX } from '@remidy/contracts';
import { formatMoney, type RepeatUnit } from '@remidy/domain';
import { useHousehold } from '../../../core/space.tsx';
import { DateField, MoneyField, RadioField, SelectField, TextField } from '../../../ui/index.ts';
import type { Category } from '../../categories/index.ts';
import { LogoField } from '../../logos/index.ts';
import { REPEATS, type Repeat } from '../repeats.ts';
import { preview, scheduleOfDraft, type BillDraft } from './billDraft.ts';

interface StepProps {
  draft: BillDraft;
  change: (changes: Partial<BillDraft>) => void;
  errors: Record<string, string>;
  /** Whether this is a new bill. An existing one can't move between personal and shared. */
  isNew: boolean;
}

const UNITS = [
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
] as const;

const errorOf = (errors: Record<string, string>, key: string) =>
  errors[key] ? { error: errors[key] } : {};

export function WhatStep({
  draft,
  change,
  errors,
  isNew,
  wasShared,
}: StepProps & { wasShared?: boolean }) {
  const household = useHousehold();
  const moving = !isNew && wasShared !== undefined && (draft.owner === 'shared') !== wasShared;
  return (
    <>
      <TextField
        label="Name"
        hint="Such as Electric or Car insurance."
        value={draft.name}
        maxLength={BILL_NAME_MAX}
        autoComplete="off"
        onChange={(event) => {
          change({ name: event.target.value });
        }}
        {...errorOf(errors, 'name')}
      />
      <TextField
        label="Merchant (optional)"
        hint="Who you pay, such as Chase. Used to find its logo."
        value={draft.merchant}
        maxLength={BILL_MERCHANT_MAX}
        autoComplete="off"
        onChange={(event) => {
          change({ merchant: event.target.value });
        }}
        {...errorOf(errors, 'merchant')}
      />
      {household ? (
        <div className="flex flex-col gap-1.5">
          <RadioField
            label="Whose bill"
            value={draft.owner}
            options={[
              { value: 'personal', label: 'Just mine' },
              { value: 'shared', label: `Shared with ${household.name}` },
            ]}
            onChange={(owner) => {
              change({ owner });
            }}
          />
          {moving ? (
            <p className="rounded-xl bg-surface-2 p-3 text-sm" role="status">
              {draft.owner === 'shared'
                ? `Everyone in ${household.name} will see this bill and its past due dates.`
                : `Others in ${household.name} will no longer see this bill or its past due dates.`}
            </p>
          ) : null}
        </div>
      ) : null}
      <RadioField
        label="Amount"
        value={draft.varies}
        options={[
          { value: 'fixed', label: 'Same each time' },
          { value: 'varies', label: 'Varies' },
        ]}
        onChange={(varies) => {
          change({ varies });
        }}
      />
      <MoneyField
        label={draft.varies === 'varies' ? 'Usual amount (optional)' : 'Amount due'}
        cents={draft.cents}
        onCentsChange={(cents) => {
          change({ cents });
        }}
        {...errorOf(errors, 'expectedCents')}
      />
    </>
  );
}

export function WhenStep({ draft, change, errors, isNew }: StepProps) {
  const schedule = scheduleOfDraft(draft);
  return (
    <>
      <SelectField
        label="Repeats"
        value={draft.repeat}
        onChange={(event) => {
          change({ repeat: event.target.value as Repeat });
        }}
      >
        {REPEATS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      {draft.repeat === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Every"
            inputMode="numeric"
            value={draft.every}
            onChange={(event) => {
              change({ every: event.target.value });
            }}
            {...errorOf(errors, 'schedule.every')}
          />
          <SelectField
            label="Unit"
            value={draft.unit}
            onChange={(event) => {
              change({ unit: event.target.value as RepeatUnit });
            }}
          >
            {UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}
      <DateField
        label={draft.repeat === 'once' ? 'Due date' : isNew ? 'Next due date' : 'First due date'}
        {...(!isNew && draft.repeat !== 'once'
          ? { hint: 'Later due dates count from this one.' }
          : {})}
        date={draft.firstDue}
        onDateChange={(firstDue) => {
          change({ firstDue });
        }}
        {...errorOf(errors, 'schedule.firstDue')}
      />
      {draft.repeat !== 'once' ? (
        <DateField
          label="Last due date (optional)"
          hint="Leave empty if it doesn’t end."
          date={draft.lastDue}
          onDateChange={(lastDue) => {
            change({ lastDue });
          }}
          {...errorOf(errors, 'schedule.lastDue')}
        />
      ) : null}
      {schedule ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2" aria-live="polite">
          {preview(schedule)}
        </p>
      ) : null}
    </>
  );
}

export function DetailsStep({
  draft,
  change,
  errors,
  isNew,
  categories,
}: StepProps & { categories: Category[] }) {
  const schedule = scheduleOfDraft(draft);
  const category = categories.find((item) => item.id === draft.categoryId);
  return (
    <>
      <LogoField
        name={draft.name}
        searchFor={draft.merchant.trim() || draft.name}
        url={draft.url}
        logoId={draft.logoId}
        chosen={draft.logoChosen}
        pickFirst={isNew}
        onChange={(logoId, chosen) => {
          change({ logoId, logoChosen: chosen });
        }}
      />
      {errors.logoId ? (
        <p role="alert" className="text-sm text-danger">
          {errors.logoId}
        </p>
      ) : null}
      <SelectField
        label="Category (optional)"
        value={draft.categoryId}
        onChange={(event) => {
          change({ categoryId: event.target.value });
        }}
        {...errorOf(errors, 'categoryId')}
      >
        <option value="">None</option>
        {categories
          .filter((item) => !item.archived || item.id === draft.categoryId)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </SelectField>
      <RadioField
        label="Paid automatically"
        value={draft.autopay}
        options={[
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes, auto-pay' },
        ]}
        onChange={(autopay) => {
          change({ autopay });
        }}
      />
      <TextField
        label="Website (optional)"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={draft.url}
        onChange={(event) => {
          change({ url: event.target.value });
        }}
        {...errorOf(errors, 'url')}
      />
      <TextField
        label="Notes (optional)"
        maxLength={BILL_NOTES_MAX}
        value={draft.notes}
        onChange={(event) => {
          change({ notes: event.target.value });
        }}
        {...errorOf(errors, 'notes')}
      />
      {isNew && schedule ? (
        <section aria-label="Summary" className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-semibold">{draft.name.trim()}</p>
          <p className="text-ink-2">
            {[
              draft.merchant.trim(),
              draft.cents === null ? 'Varies' : formatMoney(draft.cents),
              category?.name,
              draft.autopay === 'yes' ? 'Auto-pay' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-ink-2">{preview(schedule)}</p>
        </section>
      ) : null}
    </>
  );
}
