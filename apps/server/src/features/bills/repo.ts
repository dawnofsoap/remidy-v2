import type { BillResponse, BillScheduleInput } from '@remidy/contracts';
import {
  bill,
  billOccurrence,
  category,
  membership,
  payment,
  space,
  type Orm,
  type Transaction,
} from '@remidy/db';
import {
  describeSchedule,
  parseCalendarDate,
  scheduleProblem,
  today,
  type CalendarDate,
  type Schedule,
} from '@remidy/domain';
import { and, asc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { recordActivity } from '../../core/activity.ts';
import { AppError, isStillUsed } from '../../core/errors.ts';
import { roleAtLeast } from '../../core/spaces.ts';
import { logoExists } from '../logos/index.ts';
import { firstDueDates, futureDueDates } from './occurrences.ts';

const NOT_FOUND = new AppError(404, 'not_found', 'That bill wasn’t found.');

/** What each due date copies from its bill, so later edits don't rewrite it. */
interface BillCopy {
  id: string;
  spaceId: string;
  name: string;
  expectedCents: number | null;
  isVariable: boolean;
  categoryId: string | null;
}

/** Adds due dates for a bill. Dates that already exist are left alone. */
async function addDueDates(transaction: Transaction | Orm, copy: BillCopy, dates: CalendarDate[]) {
  if (dates.length === 0) return;
  await transaction
    .insert(billOccurrence)
    .values(
      dates.map((dueOn) => ({
        billId: copy.id,
        spaceId: copy.spaceId,
        dueOn,
        billName: copy.name,
        categoryId: copy.categoryId,
        expectedCents: copy.expectedCents,
        isVariable: copy.isVariable,
      })),
    )
    .onConflictDoNothing();
}

/**
 * After an edit, replaces due dates from today on that are still open. Earlier ones keep what the
 * bill was when they were due.
 */
async function replaceFutureDueDates(
  transaction: Transaction,
  copy: BillCopy,
  schedule: Schedule,
  timeZone: string,
  archived: boolean,
) {
  await transaction.delete(billOccurrence).where(
    and(
      eq(billOccurrence.billId, copy.id),
      eq(billOccurrence.state, 'open'),
      gte(billOccurrence.dueOn, today(timeZone)),
      // A due date with any payment, even a voided one, is part of the history, so it stays.
      sql`not exists (select 1 from ${payment} where ${payment.occurrenceId} = ${billOccurrence.id})`,
    ),
  );
  if (!archived) await addDueDates(transaction, copy, futureDueDates(schedule, timeZone));
}

/** Keeps every active bill's due dates 13 months ahead. Safe to run any number of times. */
export async function extendDueDates(orm: Orm): Promise<void> {
  const bills = await orm
    .select({
      id: bill.id,
      spaceId: bill.spaceId,
      name: bill.name,
      expectedCents: bill.expectedCents,
      isVariable: bill.isVariable,
      categoryId: bill.categoryId,
      schedule: bill.schedule,
      timeZone: space.timeZone,
    })
    .from(bill)
    .innerJoin(space, eq(space.id, bill.spaceId))
    .where(isNull(bill.archivedAt));
  for (const { timeZone, schedule, ...copy } of bills) {
    await addDueDates(orm, copy, futureDueDates(schedule as Schedule, timeZone));
  }
}
const invalid = (path: string, message: string) =>
  new AppError(422, 'invalid', message, [{ path, message }]);

export interface BillFields {
  name: string;
  expectedCents: number | null;
  isVariable: boolean;
  schedule: BillScheduleInput;
  categoryId: string | null;
  autopay: boolean;
  url: string | null;
  notes: string | null;
  logoId?: string | null | undefined;
}

/** Checks the dates are real days and the schedule makes sense, for an answer the person can use. */
function toSchedule(input: BillScheduleInput): Schedule {
  const firstDue = parseCalendarDate(input.firstDue);
  if (!firstDue) throw invalid('schedule.firstDue', 'That date doesn’t exist.');
  if (input.kind === 'once') return { kind: 'once', firstDue };
  let lastDue: CalendarDate | null = null;
  if (input.lastDue) {
    lastDue = parseCalendarDate(input.lastDue);
    if (!lastDue) throw invalid('schedule.lastDue', 'That date doesn’t exist.');
  }
  const schedule: Schedule = { ...input, firstDue, lastDue };
  const problem = scheduleProblem(schedule);
  if (problem) throw invalid(lastDue ? 'schedule.lastDue' : 'schedule.every', problem);
  return schedule;
}

/**
 * The space whose categories the person uses: their household's, or their own without one. Bills
 * in the space being written to can only use categories from here.
 */
async function listsSpaceOf(transaction: Transaction, userId: string): Promise<string | null> {
  const rows = await transaction
    .select({ id: space.id, kind: space.kind })
    .from(membership)
    .innerJoin(space, eq(space.id, membership.spaceId))
    .where(eq(membership.userId, userId));
  return (
    (rows.find((row) => row.kind === 'shared') ?? rows.find((row) => row.kind === 'personal'))
      ?.id ?? null
  );
}

async function checkCategory(transaction: Transaction, userId: string, categoryId: string) {
  const listsSpace = await listsSpaceOf(transaction, userId);
  const [found] = await transaction
    .select({ archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.spaceId, listsSpace ?? '')));
  // Another space's category reads as missing, so its existence isn't revealed.
  if (!found) throw invalid('categoryId', 'Choose one of your categories.');
  if (found.archivedAt) throw invalid('categoryId', 'That category is archived. Choose another.');
}

async function checkLogo(transaction: Transaction, logoId: string) {
  if (!(await logoExists(transaction, logoId))) {
    throw invalid('logoId', 'That logo isn’t available. Choose it again.');
  }
}

const columns = {
  id: bill.id,
  spaceId: bill.spaceId,
  shared: sql<boolean>`${space.kind} = 'shared'`.mapWith(Boolean),
  name: bill.name,
  expectedCents: bill.expectedCents,
  isVariable: bill.isVariable,
  schedule: bill.schedule,
  categoryId: bill.categoryId,
  categoryName: category.name,
  autopay: bill.autopay,
  url: bill.url,
  notes: bill.notes,
  logoId: bill.logoId,
  archived: isNotNull(bill.archivedAt).mapWith(Boolean),
};

/** Every bill in every space the person belongs to. Another member's personal bills never are. */
export function listBills(orm: Orm | Transaction, userId: string, billId?: string) {
  return orm
    .select(columns)
    .from(bill)
    .innerJoin(membership, and(eq(membership.spaceId, bill.spaceId), eq(membership.userId, userId)))
    .innerJoin(space, eq(space.id, bill.spaceId))
    .leftJoin(category, eq(category.id, bill.categoryId))
    .where(billId ? eq(bill.id, billId) : undefined)
    .orderBy(sql`lower(${bill.name})`, asc(bill.id)) as Promise<BillResponse[]>;
}

async function timeZoneOf(transaction: Transaction, spaceId: string): Promise<string> {
  const [row] = await transaction
    .select({ timeZone: space.timeZone })
    .from(space)
    .where(eq(space.id, spaceId));
  return row?.timeZone ?? 'UTC';
}

async function readBill(transaction: Transaction, userId: string, billId: string) {
  const [row] = await listBills(transaction, userId, billId);
  if (!row) throw NOT_FOUND;
  return row;
}

const copyOf = (row: BillResponse): BillCopy => ({
  id: row.id,
  spaceId: row.spaceId,
  name: row.name,
  expectedCents: row.expectedCents,
  isVariable: row.isVariable,
  categoryId: row.categoryId,
});

/** What the activity log keeps about a bill. Notes and links can be long, so only that they changed. */
const recordable = (row: BillResponse) => ({
  name: row.name,
  expectedCents: row.expectedCents,
  isVariable: row.isVariable,
  schedule: describeSchedule(row.schedule as Schedule),
  categoryId: row.categoryId,
  autopay: row.autopay,
  archived: row.archived,
});

export function createBill(
  orm: Orm,
  spaceId: string,
  userId: string,
  fields: BillFields,
): Promise<BillResponse> {
  return orm.transaction(async (transaction) => {
    const schedule = toSchedule(fields.schedule);
    if (fields.categoryId) await checkCategory(transaction, userId, fields.categoryId);
    if (fields.logoId) await checkLogo(transaction, fields.logoId);
    const [created] = await transaction
      .insert(bill)
      .values({ ...fields, logoId: fields.logoId ?? null, spaceId, schedule })
      .returning({ id: bill.id });
    if (!created) throw new Error('The bill was not created.');

    const row = await readBill(transaction, userId, created.id);
    const timeZone = await timeZoneOf(transaction, spaceId);
    await addDueDates(transaction, copyOf(row), firstDueDates(schedule, timeZone));
    await recordActivity(transaction, {
      spaceId,
      actorId: userId,
      entity: 'bill',
      entityId: row.id,
      action: 'created',
      before: null,
      after: recordable(row),
    });
    return row;
  });
}

export function updateBill(
  orm: Orm,
  spaceId: string,
  billId: string,
  userId: string,
  changes: { [K in keyof BillFields]?: BillFields[K] | undefined } & {
    archived?: boolean | undefined;
  },
): Promise<BillResponse> {
  return orm.transaction(async (transaction) => {
    await transaction
      .select({ id: bill.id })
      .from(bill)
      .where(and(eq(bill.id, billId), eq(bill.spaceId, spaceId)))
      .for('update');
    const before = await readBill(transaction, userId, billId);
    if (before.spaceId !== spaceId) throw NOT_FOUND;

    const isVariable = changes.isVariable ?? before.isVariable;
    const expectedCents =
      changes.expectedCents === undefined ? before.expectedCents : changes.expectedCents;
    if (!isVariable && expectedCents === null) {
      throw invalid('expectedCents', 'Enter an amount, or mark it as varying.');
    }
    const schedule = changes.schedule
      ? toSchedule(changes.schedule)
      : (before.schedule as Schedule);
    if (changes.categoryId && changes.categoryId !== before.categoryId) {
      await checkCategory(transaction, userId, changes.categoryId);
    }
    if (changes.logoId && changes.logoId !== before.logoId) {
      await checkLogo(transaction, changes.logoId);
    }

    const { archived, ...fields } = changes;
    await transaction
      .update(bill)
      .set({
        ...fields,
        schedule,
        ...(archived === undefined ? {} : { archivedAt: archived ? sql`now()` : null }),
        updatedAt: sql`now()`,
      })
      .where(and(eq(bill.id, billId), eq(bill.spaceId, spaceId)));
    const after = await readBill(transaction, userId, billId);

    const was = recordable(before);
    const now = recordable(after);
    const changed = (Object.keys(now) as (keyof typeof now)[]).filter(
      (key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]),
    );
    const otherChanges = (['url', 'notes', 'logoId'] as const).filter(
      (key) => before[key] !== after[key],
    );
    if (changed.length === 0 && otherChanges.length === 0) return after;

    if (changed.length > 0) {
      await replaceFutureDueDates(
        transaction,
        copyOf(after),
        schedule,
        await timeZoneOf(transaction, spaceId),
        after.archived,
      );
    }
    await recordActivity(transaction, {
      spaceId,
      actorId: userId,
      entity: 'bill',
      entityId: billId,
      action: 'updated',
      before: {
        ...Object.fromEntries(changed.map((key) => [key, was[key]])),
        ...Object.fromEntries(otherChanges.map((key) => [key, 'changed'])),
      },
      after: {
        ...Object.fromEntries(changed.map((key) => [key, now[key]])),
        ...Object.fromEntries(otherChanges.map((key) => [key, 'changed'])),
      },
    });
    return after;
  });
}

const HAS_PAYMENTS = new AppError(
  409,
  'has_payments',
  'This bill has payments, so it can’t be deleted. Archive it instead to keep its history.',
);

/** Deletes a bill and its due dates. The database refuses one with payments. */
export function deleteBill(orm: Orm, spaceId: string, billId: string, userId: string) {
  return orm.transaction(async (transaction) => {
    const before = await readBill(transaction, userId, billId);
    if (before.spaceId !== spaceId) throw NOT_FOUND;
    try {
      await transaction.delete(bill).where(and(eq(bill.id, billId), eq(bill.spaceId, spaceId)));
    } catch (error) {
      if (isStillUsed(error)) throw HAS_PAYMENTS;
      throw error;
    }
    await recordActivity(transaction, {
      spaceId,
      actorId: userId,
      entity: 'bill',
      entityId: billId,
      action: 'deleted',
      before: recordable(before),
      after: null,
    });
  });
}

/**
 * Moves a bill between the person's personal space and their household, with all its due dates, so
 * its history goes with it. A category the new space can't use is swapped for the household's one
 * with the same name, or cleared.
 */
export function moveBill(
  orm: Orm,
  fromSpaceId: string,
  billId: string,
  userId: string,
  toSpaceId: string,
): Promise<BillResponse> {
  return orm.transaction(async (transaction) => {
    const before = await readBill(transaction, userId, billId);
    if (before.spaceId !== fromSpaceId) throw NOT_FOUND;
    if (toSpaceId === fromSpaceId) throw invalid('toSpaceId', 'It’s already there.');
    // Only somewhere the person could add a bill themselves.
    const [target] = await transaction
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.spaceId, toSpaceId)));
    if (!target || !roleAtLeast(target.role, 'manager')) {
      throw invalid('toSpaceId', 'You can’t add bills there.');
    }

    let categoryId = before.categoryId;
    if (categoryId && categoryId !== (await categoryFor(transaction, userId, categoryId))) {
      categoryId = null;
    }
    if (before.categoryId && !categoryId && before.categoryName) {
      const listsSpace = await listsSpaceOf(transaction, userId);
      const [same] = await transaction
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.spaceId, listsSpace ?? ''),
            sql`lower(${category.name}) = lower(${before.categoryName})`,
            isNull(category.archivedAt),
          ),
        );
      categoryId = same?.id ?? null;
    }

    await transaction
      .update(bill)
      .set({ spaceId: toSpaceId, categoryId, updatedAt: sql`now()` })
      .where(and(eq(bill.id, billId), eq(bill.spaceId, fromSpaceId)));
    await transaction
      .update(billOccurrence)
      .set({ spaceId: toSpaceId })
      .where(eq(billOccurrence.billId, billId));
    const after = await readBill(transaction, userId, billId);
    // Future due dates pick up the new category. Past ones keep what they were.
    await replaceFutureDueDates(
      transaction,
      copyOf(after),
      after.schedule as Schedule,
      await timeZoneOf(transaction, toSpaceId),
      after.archived,
    );

    const where = (shared: boolean) => (shared ? 'shared' : 'personal');
    for (const [spaceId, action] of [
      [fromSpaceId, 'moved out'],
      [toSpaceId, 'moved in'],
    ] as const) {
      await recordActivity(transaction, {
        spaceId,
        actorId: userId,
        entity: 'bill',
        entityId: billId,
        action,
        before: { where: where(before.shared), categoryId: before.categoryId },
        after: { where: where(after.shared), categoryId: after.categoryId },
      });
    }
    return after;
  });
}

/** The category's id if the person's bills can use it, which is a category in their lists space. */
async function categoryFor(transaction: Transaction, userId: string, categoryId: string) {
  const listsSpace = await listsSpaceOf(transaction, userId);
  const [found] = await transaction
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.spaceId, listsSpace ?? '')));
  return found?.id ?? null;
}
