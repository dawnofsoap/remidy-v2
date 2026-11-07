import type { AgendaResponse, BillResponse, BillScheduleInput } from '@remidy/contracts';
import {
  bill,
  billOccurrence,
  category,
  membership,
  space,
  type Orm,
  type Transaction,
} from '@remidy/db';
import {
  compareDates,
  daysBetween,
  describeSchedule,
  parseCalendarDate,
  scheduleProblem,
  today,
  type CalendarDate,
  type Schedule,
} from '@remidy/domain';
import { and, asc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { recordActivity } from '../../core/activity.ts';
import { AppError } from '../../core/errors.ts';
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
  await transaction
    .delete(billOccurrence)
    .where(
      and(
        eq(billOccurrence.billId, copy.id),
        eq(billOccurrence.state, 'open'),
        gte(billOccurrence.dueOn, today(timeZone)),
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

/** Due dates across every space the person belongs to: anything overdue, and the range asked for. */
export async function agenda(
  orm: Orm,
  userId: string,
  from: CalendarDate,
  to: CalendarDate,
): Promise<AgendaResponse> {
  const spaceToday = sql`(now() at time zone ${space.timeZone})::date`;
  const entries = (where: ReturnType<typeof and>) =>
    orm
      .select({
        id: billOccurrence.id,
        billId: billOccurrence.billId,
        shared: sql<boolean>`${space.kind} = 'shared'`.mapWith(Boolean),
        name: billOccurrence.billName,
        dueOn: billOccurrence.dueOn,
        expectedCents: billOccurrence.expectedCents,
        isVariable: billOccurrence.isVariable,
        categoryName: category.name,
        state: billOccurrence.state,
      })
      .from(billOccurrence)
      .innerJoin(
        membership,
        and(eq(membership.spaceId, billOccurrence.spaceId), eq(membership.userId, userId)),
      )
      .innerJoin(space, eq(space.id, billOccurrence.spaceId))
      .leftJoin(category, eq(category.id, billOccurrence.categoryId))
      .where(where)
      .orderBy(asc(billOccurrence.dueOn), sql`lower(${billOccurrence.billName})`);

  const [overdue, upcoming] = await Promise.all([
    entries(and(eq(billOccurrence.state, 'open'), lt(billOccurrence.dueOn, spaceToday))),
    entries(
      and(
        gte(billOccurrence.dueOn, from),
        lte(billOccurrence.dueOn, to),
        or(sql`${billOccurrence.dueOn} >= ${spaceToday}`, sql`${billOccurrence.state} <> 'open'`),
      ),
    ),
  ]);
  return { overdue, upcoming };
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
    const [created] = await transaction
      .insert(bill)
      .values({ ...fields, spaceId, schedule })
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
    const otherChanges = (['url', 'notes'] as const).filter((key) => before[key] !== after[key]);
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

/** Deletes a bill and its due dates. Once payments exist, a bill with any will be refused. */
export function deleteBill(orm: Orm, spaceId: string, billId: string, userId: string) {
  return orm.transaction(async (transaction) => {
    const before = await readBill(transaction, userId, billId);
    if (before.spaceId !== spaceId) throw NOT_FOUND;
    await transaction.delete(bill).where(and(eq(bill.id, billId), eq(bill.spaceId, spaceId)));
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

/** Checks a range is in order and not too long. */
export function checkRange(fromText: string, toText: string, maxDays: number) {
  const from = parseCalendarDate(fromText);
  const to = parseCalendarDate(toText);
  if (!from) throw invalid('from', 'That date doesn’t exist.');
  if (!to) throw invalid('to', 'That date doesn’t exist.');
  if (compareDates(from, to) > 0) throw invalid('to', 'The end can’t be before the start.');
  if (daysBetween(from, to) > maxDays)
    throw invalid('to', `Ask for ${String(maxDays)} days or fewer.`);
  return { from, to };
}
