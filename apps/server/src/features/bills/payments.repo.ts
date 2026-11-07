import type { HistoryEntry, PaymentResponse } from '@remidy/contracts';
import { bill, billOccurrence, payment, space, user, type Orm, type Transaction } from '@remidy/db';
import {
  compareDates,
  parseCalendarDate,
  settle,
  today,
  type CalendarDate,
  type Cents,
  type DueState,
} from '@remidy/domain';
import { aliasedTable, and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { recordActivity } from '../../core/activity.ts';
import { AppError } from '../../core/errors.ts';

const DUE_NOT_FOUND = new AppError(404, 'not_found', 'That due date wasn’t found.');
const PAYMENT_NOT_FOUND = new AppError(404, 'not_found', 'That payment wasn’t found.');
const invalid = (path: string, message: string) =>
  new AppError(422, 'invalid', message, [{ path, message }]);

interface Due {
  id: string;
  spaceId: string;
  billId: string;
  billName: string;
  dueOn: string;
  expectedCents: number | null;
  isVariable: boolean;
  state: DueState;
  timeZone: string;
}

/** A due date in the space, locked so its payments and state change together. */
async function lockDue(transaction: Transaction, spaceId: string, occurrenceId: string) {
  const [due] = await transaction
    .select({
      id: billOccurrence.id,
      spaceId: billOccurrence.spaceId,
      billId: billOccurrence.billId,
      billName: billOccurrence.billName,
      dueOn: billOccurrence.dueOn,
      expectedCents: billOccurrence.expectedCents,
      isVariable: billOccurrence.isVariable,
      state: billOccurrence.state,
      timeZone: space.timeZone,
    })
    .from(billOccurrence)
    .innerJoin(space, eq(space.id, billOccurrence.spaceId))
    .where(and(eq(billOccurrence.id, occurrenceId), eq(billOccurrence.spaceId, spaceId)))
    .for('update', { of: billOccurrence });
  if (!due) throw DUE_NOT_FOUND;
  return due;
}

/** Sets a due date's state from its payments, the one place that decides it. */
async function resettle(transaction: Transaction | Orm, due: Due, skipped: boolean) {
  const payments = await transaction
    .select({
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      voidedAt: payment.voidedAt,
    })
    .from(payment)
    .where(eq(payment.occurrenceId, due.id));
  const { state } = settle(
    {
      dueOn: due.dueOn as CalendarDate,
      expectedCents: due.expectedCents as Cents | null,
      isVariable: due.isVariable,
      skipped,
    },
    payments.map((row) => ({
      amountCents: row.amountCents as Cents,
      paidOn: row.paidOn as CalendarDate,
      voided: row.voidedAt !== null,
    })),
  );
  await transaction.update(billOccurrence).set({ state }).where(eq(billOccurrence.id, due.id));
  return { state, live: payments.filter((row) => row.voidedAt === null).length };
}

const payer = aliasedTable(user, 'payer');
const voider = aliasedTable(user, 'voider');

/** Payments with the names of who made and voided them. */
function paymentsWhere(orm: Orm | Transaction, where: ReturnType<typeof and>) {
  return orm
    .select({
      id: payment.id,
      occurrenceId: payment.occurrenceId,
      paidOn: payment.paidOn,
      amountCents: payment.amountCents,
      source: payment.source,
      paidByName: payer.name,
      confirmation: payment.confirmation,
      notes: payment.notes,
      voided: sql<boolean>`${payment.voidedAt} is not null`.mapWith(Boolean),
      voidReason: payment.voidReason,
      voidedByName: voider.name,
    })
    .from(payment)
    .leftJoin(payer, eq(payer.id, payment.paidBy))
    .leftJoin(voider, eq(voider.id, payment.voidedBy))
    .where(where)
    .orderBy(asc(payment.paidOn), asc(payment.id)) as Promise<PaymentResponse[]>;
}

export interface PaymentInput {
  paidOn: string;
  amountCents: number;
  confirmation: string | null;
  notes: string | null;
}

export function recordPayment(
  orm: Orm,
  spaceId: string,
  occurrenceId: string,
  userId: string,
  input: PaymentInput,
): Promise<PaymentResponse> {
  return orm.transaction(async (transaction) => {
    const due = await lockDue(transaction, spaceId, occurrenceId);
    const paidOn = parseCalendarDate(input.paidOn);
    if (!paidOn) throw invalid('paidOn', 'That date doesn’t exist.');
    if (compareDates(paidOn, today(due.timeZone)) > 0) {
      throw invalid('paidOn', 'The date paid can’t be in the future.');
    }
    if (due.state === 'skipped') {
      throw new AppError(409, 'skipped', 'This due date was skipped. Un-skip it to pay it.');
    }
    const [created] = await transaction
      .insert(payment)
      .values({ ...input, paidOn, occurrenceId, spaceId, paidBy: userId, source: 'manual' })
      .returning({ id: payment.id });
    if (!created) throw new Error('The payment was not recorded.');
    await resettle(transaction, due, false);
    await recordActivity(transaction, {
      spaceId,
      actorId: userId,
      entity: 'payment',
      entityId: created.id,
      action: 'recorded',
      before: null,
      after: { bill: due.billName, dueOn: due.dueOn, paidOn, amountCents: input.amountCents },
    });
    const [row] = await paymentsWhere(transaction, eq(payment.id, created.id));
    if (!row) throw new Error('The payment was not recorded.');
    return row;
  });
}

export function voidPayment(
  orm: Orm,
  spaceId: string,
  paymentId: string,
  userId: string,
  reason: string,
): Promise<PaymentResponse> {
  return orm.transaction(async (transaction) => {
    const [found] = await transaction
      .select({ occurrenceId: payment.occurrenceId, voidedAt: payment.voidedAt })
      .from(payment)
      .where(and(eq(payment.id, paymentId), eq(payment.spaceId, spaceId)));
    if (!found) throw PAYMENT_NOT_FOUND;
    const due = await lockDue(transaction, spaceId, found.occurrenceId);
    if (found.voidedAt) throw new AppError(409, 'already_void', 'This payment was already voided.');

    await transaction
      .update(payment)
      .set({ voidedAt: sql`now()`, voidedBy: userId, voidReason: reason })
      .where(eq(payment.id, paymentId));
    await resettle(transaction, due, due.state === 'skipped');
    await recordActivity(transaction, {
      spaceId,
      actorId: userId,
      entity: 'payment',
      entityId: paymentId,
      action: 'voided',
      before: null,
      after: { bill: due.billName, dueOn: due.dueOn, reason },
    });
    const [row] = await paymentsWhere(transaction, eq(payment.id, paymentId));
    if (!row) throw PAYMENT_NOT_FOUND;
    return row;
  });
}

/** Skips a due date that won't be charged, or undoes that. One with payments can't be skipped. */
export function setSkipped(
  orm: Orm,
  spaceId: string,
  occurrenceId: string,
  userId: string,
  skipped: boolean,
): Promise<{ state: DueState }> {
  return orm.transaction(async (transaction) => {
    const due = await lockDue(transaction, spaceId, occurrenceId);
    const { state, live } = await resettle(transaction, due, skipped);
    if (skipped && live > 0) {
      throw new AppError(
        409,
        'has_payments',
        'This due date has payments, so it can’t be skipped.',
      );
    }
    if ((due.state === 'skipped') !== skipped) {
      await recordActivity(transaction, {
        spaceId,
        actorId: userId,
        entity: 'due date',
        entityId: occurrenceId,
        action: skipped ? 'skipped' : 'unskipped',
        before: null,
        after: { bill: due.billName, dueOn: due.dueOn },
      });
    }
    return { state };
  });
}

/** Every due date of a bill so far and coming up, newest first, with its payments. */
export async function billHistory(
  orm: Orm,
  spaceId: string,
  billId: string,
): Promise<HistoryEntry[]> {
  const [found] = await orm
    .select({ id: bill.id })
    .from(bill)
    .where(and(eq(bill.id, billId), eq(bill.spaceId, spaceId)));
  if (!found) throw new AppError(404, 'not_found', 'That bill wasn’t found.');
  const dues = await orm
    .select({
      id: billOccurrence.id,
      dueOn: billOccurrence.dueOn,
      expectedCents: billOccurrence.expectedCents,
      isVariable: billOccurrence.isVariable,
      state: billOccurrence.state,
    })
    .from(billOccurrence)
    .where(and(eq(billOccurrence.billId, billId), eq(billOccurrence.spaceId, spaceId)))
    .orderBy(desc(billOccurrence.dueOn));
  const payments =
    dues.length === 0
      ? []
      : await paymentsWhere(
          orm,
          and(
            eq(payment.spaceId, spaceId),
            inArray(
              payment.occurrenceId,
              dues.map((due) => due.id),
            ),
          ),
        );
  return dues.map((due) => ({
    ...due,
    payments: payments.filter((row) => row.occurrenceId === due.id),
  }));
}

/**
 * Records auto-pay on fixed-amount bills whose due date has come, in each space's time zone. A due
 * date that already has a payment, or had an auto-pay voided because the charge failed, is left
 * alone. Safe to run any number of times.
 */
export async function recordAutopay(orm: Orm): Promise<number> {
  const due = await orm
    .select({
      id: billOccurrence.id,
      spaceId: billOccurrence.spaceId,
      billId: billOccurrence.billId,
      billName: billOccurrence.billName,
      dueOn: billOccurrence.dueOn,
      expectedCents: billOccurrence.expectedCents,
      isVariable: billOccurrence.isVariable,
      state: billOccurrence.state,
      timeZone: space.timeZone,
    })
    .from(billOccurrence)
    .innerJoin(bill, eq(bill.id, billOccurrence.billId))
    .innerJoin(space, eq(space.id, billOccurrence.spaceId))
    .where(
      and(
        eq(bill.autopay, true),
        isNull(bill.archivedAt),
        eq(billOccurrence.state, 'open'),
        eq(billOccurrence.isVariable, false),
        sql`${billOccurrence.expectedCents} > 0`,
        lte(billOccurrence.dueOn, sql`(now() at time zone ${space.timeZone})::date`),
        sql`not exists (select 1 from ${payment} where ${payment.occurrenceId} = ${billOccurrence.id}
          and (${payment.source} = 'autopay' or ${payment.voidedAt} is null))`,
      ),
    );
  let recorded = 0;
  for (const row of due) {
    await orm.transaction(async (transaction) => {
      const locked = await lockDue(transaction, row.spaceId, row.id);
      if (locked.state !== 'open') return;
      const [created] = await transaction
        .insert(payment)
        .values({
          occurrenceId: row.id,
          spaceId: row.spaceId,
          paidOn: row.dueOn,
          amountCents: row.expectedCents ?? 0,
          paidBy: null,
          source: 'autopay',
        })
        .onConflictDoNothing()
        .returning({ id: payment.id });
      if (!created) return;
      await resettle(transaction, locked, false);
      await recordActivity(transaction, {
        spaceId: row.spaceId,
        actorId: null,
        entity: 'payment',
        entityId: created.id,
        action: 'recorded',
        before: null,
        after: {
          bill: row.billName,
          dueOn: row.dueOn,
          amountCents: row.expectedCents,
          source: 'autopay',
        },
      });
      recorded += 1;
    });
  }
  return recorded;
}
