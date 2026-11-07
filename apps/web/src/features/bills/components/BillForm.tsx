import { BILL_NAME_MAX, BILL_NOTES_MAX } from '@remidy/contracts';
import {
  addDays,
  describeSchedule,
  dueDates,
  formatDate,
  MAX_EVERY,
  today,
  type CalendarDate,
  type Cents,
  type RepeatUnit,
  type Schedule,
} from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { useHousehold, useListsSpace, usePersonalSpace } from '../../../core/space.tsx';
import {
  Button,
  DateField,
  Modal,
  MoneyField,
  RadioField,
  SelectField,
  TextField,
} from '../../../ui/index.ts';
import { categoriesKey, fetchCategories } from '../../categories/index.ts';
import { createBill, updateBill, type Bill, type BillInput } from '../api.ts';
import { choiceOf, REPEATS, scheduleOf, type Repeat } from '../repeats.ts';
import { BillDangerZone } from './BillDangerZone.tsx';

interface BillFormProps {
  /** The bill to edit, or null to add one. */
  bill: Bill | null;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}

const browserToday = () => today(Intl.DateTimeFormat().resolvedOptions().timeZone);
const UNITS = [
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
] as const;

/** The next few due dates, so the person can see the schedule means what they think. */
function preview(schedule: Schedule): string {
  const from = browserToday();
  const next = dueDates(schedule, from, addDays(from, 800)).slice(0, 3);
  const upcoming = next.length
    ? `Next: ${next.map((date) => formatDate(date, 'short')).join(', ')}`
    : 'No dates from today on';
  return `${describeSchedule(schedule)}. ${upcoming}.`;
}

/** Adds a bill, or edits one, including archiving and deleting it. */
export function BillForm({ bill, onClose, onChanged }: BillFormProps) {
  const personal = usePersonalSpace();
  const household = useHousehold();
  const listsSpace = useListsSpace();
  const categories = useQuery({
    queryKey: categoriesKey(listsSpace?.id ?? ''),
    queryFn: ({ signal }) => fetchCategories(listsSpace?.id ?? '', signal),
    enabled: Boolean(listsSpace),
  });

  const initialChoice = bill
    ? choiceOf(bill.schedule)
    : { repeat: 'monthly' as Repeat, every: 1, unit: 'month' as RepeatUnit };
  const [name, setName] = useState(bill?.name ?? '');
  const [cents, setCents] = useState<Cents | null>((bill?.expectedCents ?? null) as Cents | null);
  const [varies, setVaries] = useState<'fixed' | 'varies'>(bill?.isVariable ? 'varies' : 'fixed');
  const [repeat, setRepeat] = useState<Repeat>(initialChoice.repeat);
  const [every, setEvery] = useState(String(initialChoice.every));
  const [unit, setUnit] = useState<RepeatUnit>(initialChoice.unit);
  const [firstDue, setFirstDue] = useState<CalendarDate | null>(
    (bill?.schedule.firstDue ?? null) as CalendarDate | null,
  );
  const [lastDue, setLastDue] = useState<CalendarDate | null>(
    (bill?.schedule.kind === 'repeat' ? bill.schedule.lastDue : null) as CalendarDate | null,
  );
  const [categoryId, setCategoryId] = useState(bill?.categoryId ?? '');
  const [owner, setOwner] = useState<'personal' | 'shared'>(bill?.shared ? 'shared' : 'personal');
  const [autopay, setAutopay] = useState<'no' | 'yes'>(bill?.autopay ? 'yes' : 'no');
  const [url, setUrl] = useState(bill?.url ?? '');
  const [notes, setNotes] = useState(bill?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const everyNumber = Number(every);
  const schedule =
    firstDue &&
    (repeat !== 'custom' ||
      (Number.isInteger(everyNumber) && everyNumber >= 1 && everyNumber <= MAX_EVERY))
      ? (scheduleOf({ repeat, every: everyNumber, unit }, firstDue, lastDue) as Schedule)
      : null;
  const spaceId = bill?.spaceId ?? (owner === 'shared' ? household?.id : personal?.id) ?? '';

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = 'Enter a name.';
    if (varies === 'fixed' && cents === null)
      problems.expectedCents = 'Enter an amount, or choose Varies.';
    if (!firstDue) problems['schedule.firstDue'] = 'Enter the date it’s next due.';
    if (repeat === 'custom' && !schedule && firstDue)
      problems['schedule.every'] = `Choose a number from 1 to ${String(MAX_EVERY)}.`;
    setErrors(problems);
    setFailure(null);
    if (Object.keys(problems).length > 0 || !firstDue) return;

    const input: BillInput = {
      name: name.trim(),
      expectedCents: cents,
      isVariable: varies === 'varies',
      schedule: scheduleOf({ repeat, every: everyNumber, unit }, firstDue, lastDue),
      categoryId: categoryId || null,
      autopay: autopay === 'yes',
      url: url.trim() || null,
      notes: notes.trim() || null,
    };
    setBusy(true);
    try {
      if (bill) await updateBill(spaceId, bill.id, input);
      else await createBill(spaceId, input);
      await onChanged(bill ? 'Bill saved.' : `Added ${input.name}.`);
      onClose();
    } catch (error) {
      if (error instanceof RequestFailure && Object.keys(error.fields).length > 0)
        setErrors(error.fields);
      else
        setFailure(
          error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.',
        );
    } finally {
      setBusy(false);
    }
  }

  const err = (key: string) => (errors[key] ? { error: errors[key] } : {});

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bill ? 'Edit bill' : 'Add bill'}
      description={
        bill ? 'Changes apply to due dates from today on.' : 'A bill you pay on a schedule.'
      }
    >
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Name"
          value={name}
          maxLength={BILL_NAME_MAX}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
          }}
          {...err('name')}
        />
        {household && !bill ? (
          <RadioField
            label="Whose bill"
            value={owner}
            options={[
              { value: 'personal', label: 'Just mine' },
              { value: 'shared', label: `Shared with ${household.name}` },
            ]}
            onChange={setOwner}
          />
        ) : null}
        <RadioField
          label="Amount"
          value={varies}
          options={[
            { value: 'fixed', label: 'Same each time' },
            { value: 'varies', label: 'Varies' },
          ]}
          onChange={setVaries}
        />
        <MoneyField
          label={varies === 'varies' ? 'Usual amount (optional)' : 'Amount due'}
          cents={cents}
          onCentsChange={setCents}
          {...err('expectedCents')}
        />
        <SelectField
          label="Repeats"
          value={repeat}
          onChange={(event) => {
            setRepeat(event.target.value as Repeat);
          }}
        >
          {REPEATS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        {repeat === 'custom' ? (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Every"
              inputMode="numeric"
              value={every}
              onChange={(event) => {
                setEvery(event.target.value);
              }}
              {...err('schedule.every')}
            />
            <SelectField
              label="Unit"
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value as RepeatUnit);
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
          label={repeat === 'once' ? 'Due date' : 'Next due date'}
          date={firstDue}
          onDateChange={setFirstDue}
          {...err('schedule.firstDue')}
        />
        {repeat !== 'once' ? (
          <DateField
            label="Last due date (optional)"
            hint="Leave empty if it doesn’t end."
            date={lastDue}
            onDateChange={setLastDue}
            {...err('schedule.lastDue')}
          />
        ) : null}
        {schedule ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2" aria-live="polite">
            {preview(schedule)}
          </p>
        ) : null}
        <SelectField
          label="Category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
          {...err('categoryId')}
        >
          <option value="">None</option>
          {(categories.data ?? [])
            .filter((category) => !category.archived || category.id === categoryId)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </SelectField>
        <RadioField
          label="Paid automatically"
          value={autopay}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes, auto-pay' },
          ]}
          onChange={setAutopay}
        />
        <TextField
          label="Website (optional)"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          {...err('url')}
        />
        <TextField
          label="Notes (optional)"
          maxLength={BILL_NOTES_MAX}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          {...err('notes')}
        />
        {failure ? (
          <p role="alert" className="text-danger">
            {failure}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {bill ? 'Save' : 'Add bill'}
          </Button>
        </div>
      </form>
      {bill ? <BillDangerZone bill={bill} onClose={onClose} onChanged={onChanged} /> : null}
    </Modal>
  );
}
