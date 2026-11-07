import type { AgendaResponse } from '@remidy/contracts';
import { billOccurrence, category, membership, payment, space, type Orm } from '@remidy/db';
import { compareDates, daysBetween, parseCalendarDate, type CalendarDate } from '@remidy/domain';
import { and, asc, eq, gte, lt, lte, or, sql } from 'drizzle-orm';
import { AppError } from '../../core/errors.ts';

const invalid = (path: string, message: string) =>
  new AppError(422, 'invalid', message, [{ path, message }]);

/** What's been paid toward a due date, never counting voided payments. */
const paidCents = sql<number>`coalesce((
  select sum(${payment.amountCents}) from ${payment}
  where ${payment.occurrenceId} = ${billOccurrence.id} and ${payment.voidedAt} is null
), 0)`.mapWith(Number);

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
        paidCents,
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

/**
 * The totals for a period, by the one definition every screen uses: "due" counts due dates in the
 * period that weren't skipped, and "paid" counts payments made in it that weren't voided.
 */
export async function periodTotals(
  orm: Orm,
  userId: string,
  from: CalendarDate,
  to: CalendarDate,
): Promise<{ dueCents: number; unknownCount: number; paidCents: number }> {
  const mine = sql`(select ${membership.spaceId} from ${membership} where ${membership.userId} = ${userId})`;
  const [due] = await orm
    .select({
      cents: sql<number>`coalesce(sum(${billOccurrence.expectedCents}), 0)`.mapWith(Number),
      unknown: sql<number>`count(*) filter (where ${billOccurrence.expectedCents} is null)`.mapWith(
        Number,
      ),
    })
    .from(billOccurrence)
    .where(
      and(
        sql`${billOccurrence.spaceId} in ${mine}`,
        gte(billOccurrence.dueOn, from),
        lte(billOccurrence.dueOn, to),
        sql`${billOccurrence.state} <> 'skipped'`,
      ),
    );
  const [paid] = await orm
    .select({ cents: sql<number>`coalesce(sum(${payment.amountCents}), 0)`.mapWith(Number) })
    .from(payment)
    .where(
      and(
        sql`${payment.spaceId} in ${mine}`,
        gte(payment.paidOn, from),
        lte(payment.paidOn, to),
        sql`${payment.voidedAt} is null`,
      ),
    );
  return {
    dueCents: due?.cents ?? 0,
    unknownCount: due?.unknown ?? 0,
    paidCents: paid?.cents ?? 0,
  };
}
