import type { BillScheduleInput } from '@remidy/contracts';
import {
  addDays,
  addMonthsFromAnchor,
  dateFromParts,
  datePartsOf,
  today,
  type CalendarDate,
} from '@remidy/domain';
import type { FeatureDependencies, SampleContext } from '../../core/feature.ts';
import { listCategories } from '../categories/index.ts';
import {
  billHistory,
  recordAutopay,
  recordPayment,
  setSkipped,
  voidPayment,
} from './payments.repo.ts';
import { createBill, listBills, updateBill, type BillFields } from './repo.ts';

// Fictional bills that show off what the screens handle: personal and shared, fixed and varying,
// auto-pay, every kind of schedule, something overdue, something ending, and something archived.
// Dates are counted from today, so the data always looks current.

interface SampleBill {
  name: string;
  shared: boolean;
  cents: number | null;
  varies?: boolean;
  schedule: (now: CalendarDate) => BillScheduleInput;
  category: string | null;
  autopay?: boolean;
  url?: string;
  notes?: string;
  archived?: boolean;
}

/** A day this month, or the month's last day when it's shorter. */
function thisMonth(now: CalendarDate, day: number): CalendarDate {
  const { year, month } = datePartsOf(now);
  for (let candidate = day; candidate >= 28; candidate -= 1) {
    const date = dateFromParts(year, month, candidate);
    if (date) return date;
  }
  return dateFromParts(year, month, Math.min(day, 28)) ?? now;
}

const monthly =
  (day: number, every = 1) =>
  (now: CalendarDate): BillScheduleInput => ({
    kind: 'repeat',
    unit: 'month',
    every,
    firstDue: thisMonth(now, day),
    lastDue: null,
  });

export const SAMPLE_BILLS: readonly SampleBill[] = [
  {
    name: 'Maple Street Rent',
    shared: true,
    cents: 185_000,
    schedule: monthly(1),
    category: 'Housing',
  },
  {
    name: 'City Power & Light',
    shared: true,
    cents: 12_000,
    varies: true,
    schedule: monthly(18),
    category: 'Utilities',
    notes: 'Usually higher in summer.',
  },
  {
    name: 'Riverside Water',
    shared: true,
    cents: 9_640,
    schedule: monthly(10, 3),
    category: 'Utilities',
  },
  {
    name: 'Fastline Internet',
    shared: true,
    cents: 7_000,
    schedule: monthly(12),
    category: 'Phone and internet',
    autopay: true,
    url: 'https://example.com/internet',
  },
  {
    name: 'StreamBox',
    shared: true,
    cents: 2_299,
    schedule: monthly(22),
    category: 'Subscriptions',
    autopay: true,
  },
  {
    name: 'Home insurance',
    shared: true,
    cents: 114_000,
    schedule: (now) => ({
      kind: 'repeat',
      unit: 'year',
      every: 1,
      firstDue: addMonthsFromAnchor(thisMonth(now, 15), 2),
      lastDue: null,
    }),
    category: 'Insurance',
  },
  {
    // Due a few days ago and unpaid, so Overdue has something in it.
    name: 'Trash pickup',
    shared: true,
    cents: 3_500,
    schedule: (now) => ({
      kind: 'repeat',
      unit: 'month',
      every: 1,
      firstDue: addDays(now, -3),
      lastDue: null,
    }),
    category: 'Utilities',
  },
  {
    name: 'Mobile phone',
    shared: false,
    cents: 5_500,
    // On the 1st, so there's always an auto-pay payment to see, whatever day it is.
    schedule: monthly(1),
    category: 'Phone and internet',
    autopay: true,
  },
  {
    name: 'Car loan',
    shared: false,
    cents: 38_912,
    schedule: (now) => ({
      kind: 'repeat',
      unit: 'month',
      every: 1,
      firstDue: thisMonth(now, 5),
      lastDue: addMonthsFromAnchor(thisMonth(now, 5), 23),
    }),
    category: 'Loans',
    autopay: true,
  },
  {
    name: 'Gym membership',
    shared: false,
    cents: 4_000,
    schedule: monthly(8),
    category: 'Healthcare',
  },
  {
    name: 'Car insurance',
    shared: false,
    cents: 61_240,
    schedule: monthly(28, 6),
    category: 'Insurance',
  },
  {
    name: 'Credit card',
    shared: false,
    cents: null,
    varies: true,
    schedule: monthly(25),
    category: 'Other',
  },
  {
    name: 'Weekly piano lesson',
    shared: false,
    cents: 3_000,
    schedule: (now) => ({
      kind: 'repeat',
      unit: 'week',
      every: 1,
      firstDue: addDays(now, 2),
      lastDue: null,
    }),
    category: 'Other',
  },
  {
    name: 'Dentist visit',
    shared: false,
    cents: 15_000,
    schedule: (now) => ({ kind: 'once', firstDue: addDays(now, 20) }),
    category: 'Healthcare',
  },
  {
    name: 'Old magazine subscription',
    shared: false,
    cents: 1_200,
    schedule: monthly(3),
    category: 'Subscriptions',
    archived: true,
  },
];

export async function addSampleBills(
  { database: { orm } }: FeatureDependencies,
  { userId, personalSpaceId, householdId }: SampleContext,
): Promise<string> {
  const names = new Set(SAMPLE_BILLS.map((bill) => bill.name));
  const kept = new Set(
    (await listBills(orm, userId)).filter((bill) => names.has(bill.name)).map((bill) => bill.name),
  );

  // Bills use the household's categories, since the admin belongs to one.
  const categories = await listCategories(orm, householdId);
  const categoryId = (name: string | null) =>
    categories.find((category) => category.name === name)?.id ?? null;
  const now = today('America/Chicago');

  const made = new Map<string, { spaceId: string; id: string }>();
  let added = 0;
  for (const sample of SAMPLE_BILLS) {
    if (kept.has(sample.name)) continue;
    const spaceId = sample.shared ? householdId : personalSpaceId;
    const fields: BillFields = {
      name: sample.name,
      expectedCents: sample.cents,
      isVariable: sample.varies ?? false,
      schedule: sample.schedule(now),
      categoryId: categoryId(sample.category),
      autopay: sample.autopay ?? false,
      url: sample.url ?? null,
      notes: sample.notes ?? null,
    };
    const created = await createBill(orm, spaceId, userId, fields);
    if (sample.archived) await updateBill(orm, spaceId, created.id, userId, { archived: true });
    made.set(sample.name, { spaceId, id: created.id });
    added += 1;
  }
  if (added === 0) return `all ${String(SAMPLE_BILLS.length)} sample bills were already there`;
  await addSamplePayments(orm, userId, made, now);
  return `added ${String(added)} sample bills, with payments`;
}

/**
 * Payments that show every state: paid, paid in part, a payment voided and paid again, a skipped
 * due date, and auto-pay. Only for bills just added, so running again doesn't pay twice.
 */
async function addSamplePayments(
  orm: FeatureDependencies['database']['orm'],
  userId: string,
  made: Map<string, { spaceId: string; id: string }>,
  now: CalendarDate,
) {
  const firstDue = async (name: string) => {
    const bill = made.get(name);
    if (!bill) return null;
    const dues = await billHistory(orm, bill.spaceId, bill.id);
    const earliest = dues.at(-1);
    return earliest ? { spaceId: bill.spaceId, id: earliest.id } : null;
  };
  const pay = async (name: string, amountCents: number, notes: string | null = null) => {
    const due = await firstDue(name);
    if (!due) return null;
    return recordPayment(orm, due.spaceId, due.id, userId, {
      paidOn: now,
      amountCents,
      confirmation: null,
      notes,
    });
  };

  await pay('Maple Street Rent', 185_000);
  // Paid off before it was cancelled, so the archived bill doesn't leave anything overdue.
  await pay('Old magazine subscription', 1_200, 'Final payment before cancelling.');
  await pay('Riverside Water', 5_000, 'The rest next week.');
  const twice = await pay('Gym membership', 4_000);
  const gym = made.get('Gym membership');
  if (twice && gym) {
    await voidPayment(orm, gym.spaceId, twice.id, userId, 'Entered twice by mistake.');
    await pay('Gym membership', 4_000);
  }
  const free = await firstDue('StreamBox');
  if (free) await setSkipped(orm, free.spaceId, free.id, userId, true);
  await recordAutopay(orm);
}
