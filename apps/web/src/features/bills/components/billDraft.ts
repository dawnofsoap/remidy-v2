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
import type { Bill, BillInput } from '../api.ts';
import { choiceOf, scheduleOf, type Repeat } from '../repeats.ts';

/** Everything the wizard has collected so far, as typed. */
export interface BillDraft {
  name: string;
  owner: 'personal' | 'shared';
  cents: Cents | null;
  varies: 'fixed' | 'varies';
  repeat: Repeat;
  every: string;
  unit: RepeatUnit;
  firstDue: CalendarDate | null;
  lastDue: CalendarDate | null;
  categoryId: string;
  autopay: 'no' | 'yes';
  url: string;
  notes: string;
  logoId: string | null;
  /** Whether the person chose the logo, or removed it, so finding one stops replacing it. */
  logoChosen: boolean;
}

export const STEPS = ['What it is', 'When it’s due', 'Details'] as const;

/** Which step asks for each field, so a problem found later can send the person back to it. */
const STEP_OF_FIELD: Record<string, number> = {
  name: 0,
  expectedCents: 0,
  'schedule.firstDue': 1,
  'schedule.lastDue': 1,
  'schedule.every': 1,
  categoryId: 2,
  url: 2,
  notes: 2,
  logoId: 2,
};

export const stepOf = (field: string) => STEP_OF_FIELD[field] ?? 0;

/** The message key a draft field's problems are shown under. */
const ERROR_KEY: Record<keyof BillDraft, string> = {
  name: 'name',
  owner: 'owner',
  cents: 'expectedCents',
  varies: 'expectedCents',
  repeat: 'schedule.every',
  every: 'schedule.every',
  unit: 'schedule.every',
  firstDue: 'schedule.firstDue',
  lastDue: 'schedule.lastDue',
  categoryId: 'categoryId',
  autopay: 'autopay',
  url: 'url',
  notes: 'notes',
  logoId: 'logoId',
  logoChosen: 'logoId',
};

export const errorKeyOf = (field: keyof BillDraft) => ERROR_KEY[field];

export function draftOf(bill: Bill | null): BillDraft {
  const choice = bill
    ? choiceOf(bill.schedule)
    : { repeat: 'monthly' as Repeat, every: 1, unit: 'month' as RepeatUnit };
  return {
    name: bill?.name ?? '',
    owner: bill?.shared ? 'shared' : 'personal',
    cents: (bill?.expectedCents ?? null) as Cents | null,
    varies: bill?.isVariable ? 'varies' : 'fixed',
    repeat: choice.repeat,
    every: String(choice.every),
    unit: choice.unit,
    firstDue: (bill?.schedule.firstDue ?? null) as CalendarDate | null,
    lastDue: (bill?.schedule.kind === 'repeat'
      ? bill.schedule.lastDue
      : null) as CalendarDate | null,
    categoryId: bill?.categoryId ?? '',
    autopay: bill?.autopay ? 'yes' : 'no',
    url: bill?.url ?? '',
    notes: bill?.notes ?? '',
    logoId: bill?.logoId ?? null,
    // An existing bill's logo stays as it is unless the person changes it.
    logoChosen: bill !== null,
  };
}

function validEvery(draft: BillDraft): number | null {
  const every = Number(draft.every);
  return Number.isInteger(every) && every >= 1 && every <= MAX_EVERY ? every : null;
}

/** The schedule the draft describes, or null while it's incomplete. */
export function scheduleOfDraft(draft: BillDraft): Schedule | null {
  if (!draft.firstDue) return null;
  const every = draft.repeat === 'custom' ? validEvery(draft) : 1;
  if (every === null) return null;
  return scheduleOf(
    { repeat: draft.repeat, every, unit: draft.unit },
    draft.firstDue,
    draft.lastDue,
  ) as Schedule;
}

/** What's missing or wrong on one step, by field. */
export function problemsOnStep(draft: BillDraft, step: number): Record<string, string> {
  const problems: Record<string, string> = {};
  if (step === 0) {
    if (!draft.name.trim()) problems.name = 'Enter a name.';
    if (draft.varies === 'fixed' && draft.cents === null) {
      problems.expectedCents = 'Enter an amount, or choose Varies.';
    }
  }
  if (step === 1) {
    if (!draft.firstDue) problems['schedule.firstDue'] = 'Enter the date it’s due.';
    if (draft.repeat === 'custom' && validEvery(draft) === null) {
      problems['schedule.every'] = `Choose a number from 1 to ${String(MAX_EVERY)}.`;
    }
  }
  return problems;
}

export function inputOf(draft: BillDraft): BillInput | null {
  const schedule = scheduleOfDraft(draft);
  if (!schedule) return null;
  return {
    name: draft.name.trim(),
    expectedCents: draft.cents,
    isVariable: draft.varies === 'varies',
    schedule,
    categoryId: draft.categoryId || null,
    autopay: draft.autopay === 'yes',
    url: draft.url.trim() || null,
    notes: draft.notes.trim() || null,
    logoId: draft.logoId,
  };
}

/** The schedule in words with the next few dates, so the person can see it means what they think. */
export function preview(schedule: Schedule): string {
  const from = today(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const next = dueDates(schedule, from, addDays(from, 800)).slice(0, 3);
  const upcoming = next.length
    ? `Next: ${next.map((date) => formatDate(date, 'short')).join(', ')}`
    : 'No dates from today on';
  return `${describeSchedule(schedule)}. ${upcoming}.`;
}
