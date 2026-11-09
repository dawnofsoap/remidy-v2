import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { RequestFailure } from '../../../core/session.ts';
import { useHousehold, useListsSpace, usePersonalSpace } from '../../../core/space.tsx';
import { Button, Modal, Steps } from '../../../ui/index.ts';
import { categoriesKey, fetchCategories } from '../../categories/index.ts';
import { createBill, moveBill, updateBill, type Bill } from '../api.ts';
import { BillDangerZone } from './BillDangerZone.tsx';
import { BillHistory } from './BillHistory.tsx';
import {
  draftOf,
  errorKeyOf,
  inputOf,
  problemsOnStep,
  STEPS,
  stepOf,
  type BillDraft,
} from './billDraft.ts';
import { DetailsStep, WhatStep, WhenStep } from './BillSteps.tsx';

interface BillFormProps {
  /** The bill to edit, or null to add one. */
  bill: Bill | null;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}

const LAST = STEPS.length - 1;
/** Only when editing: the bill's due dates and payments, after its details. */
const HISTORY = STEPS.length;

/**
 * Adds a bill in three short steps, checking each before moving on. Editing shows the same steps,
 * which can be visited in any order and saved from any of them.
 */
export function BillForm({ bill, onClose, onChanged }: BillFormProps) {
  const isNew = bill === null;
  const personal = usePersonalSpace();
  const household = useHousehold();
  const listsSpace = useListsSpace();
  const categories = useQuery({
    queryKey: categoriesKey(listsSpace?.id ?? ''),
    queryFn: ({ signal }) => fetchCategories(listsSpace?.id ?? '', signal),
    enabled: Boolean(listsSpace),
  });

  const [draft, setDraft] = useState<BillDraft>(() => draftOf(bill));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function change(changes: Partial<BillDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    // A field's message goes once it's edited, so it doesn't linger after the fix.
    const cleared = new Set(Object.keys(changes).map((key) => errorKeyOf(key as keyof BillDraft)));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !cleared.has(key))),
    );
  }

  function goTo(index: number) {
    setErrors({});
    setStep(index);
  }

  /** Goes to the first step with a problem and says false, or says true when every step is fine. */
  function checkAll(): boolean {
    for (let index = 0; index <= LAST; index += 1) {
      const problems = problemsOnStep(draft, index);
      if (Object.keys(problems).length > 0) {
        setErrors(problems);
        setStep(index);
        return false;
      }
    }
    return true;
  }

  function next() {
    const problems = problemsOnStep(draft, step);
    setErrors(problems);
    if (Object.keys(problems).length === 0) setStep(step + 1);
  }

  async function save() {
    setFailure(null);
    if (!checkAll()) return;
    const input = inputOf(draft);
    const spaceId = draft.owner === 'shared' ? household?.id : personal?.id;
    if (!input || !spaceId) return;
    setBusy(true);
    try {
      if (!bill) {
        await createBill(spaceId, input);
      } else {
        await updateBill(bill.spaceId, bill.id, input);
        // Moved after the other changes, so a category the new space can't use is swapped there.
        if (spaceId !== bill.spaceId) await moveBill(bill.spaceId, bill.id, spaceId);
      }
      await onChanged(bill ? 'Bill saved.' : `Added ${input.name}.`);
      onClose();
    } catch (error) {
      const fields = error instanceof RequestFailure ? error.fields : {};
      const first = Object.keys(fields)[0];
      if (first) {
        setErrors(fields);
        setStep(stepOf(first));
      } else {
        setFailure(
          error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (isNew && step < LAST) next();
    else void save();
  }

  const stepProps = { draft, change, errors, isNew };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isNew ? 'Add bill' : `Edit ${bill.name}`}
      description={
        isNew ? 'A bill you pay on a schedule.' : 'Changes apply to due dates from today on.'
      }
      hideDescription={isNew}
    >
      <Steps
        steps={isNew ? STEPS : [...STEPS, 'History']}
        current={step}
        {...(isNew ? {} : { onSelect: goTo })}
      />
      {!isNew && step === HISTORY ? (
        <div className="flex flex-col gap-4">
          <BillHistory bill={bill} />
          <div className="flex justify-between gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                goTo(LAST);
              }}
            >
              Back
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {step === 0 ? (
            <WhatStep {...stepProps} {...(bill ? { wasShared: bill.shared } : {})} />
          ) : null}
          {step === 1 ? <WhenStep {...stepProps} /> : null}
          {step === 2 ? <DetailsStep {...stepProps} categories={categories.data ?? []} /> : null}
          {failure ? (
            <p role="alert" className="text-danger">
              {failure}
            </p>
          ) : null}
          {/* Stays in view while a long step scrolls. */}
          <div className="sticky -bottom-6 -mx-6 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-6 py-4">
            {step > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  goTo(step - 1);
                }}
              >
                Back
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              {!isNew ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    goTo(step + 1);
                  }}
                >
                  Next
                </Button>
              ) : null}
              <Button type="submit" busy={busy}>
                {isNew ? (step < LAST ? 'Next' : 'Add bill') : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      )}
      {!isNew && step === LAST ? (
        <BillDangerZone bill={bill} onClose={onClose} onChanged={onChanged} />
      ) : null}
    </Modal>
  );
}
