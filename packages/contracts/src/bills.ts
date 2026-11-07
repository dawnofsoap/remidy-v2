import { z } from 'zod';

export const BILL_NAME_MAX = 100;
export const BILL_NOTES_MAX = 2000;
/** The longest agenda range one request can ask for. */
export const AGENDA_MAX_DAYS = 400;

// Matches MAX_CENTS in @remidy/domain.
const MAX_CENTS = 99_999_999_999;

/** A calendar date as `YYYY-MM-DD`. The server also checks the day exists. */
export const calendarDateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-01-31.');

export const billSchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), firstDue: calendarDateText }),
  z.object({
    kind: z.literal('repeat'),
    unit: z.enum(['week', 'month', 'year']),
    every: z
      .number()
      .int('Use a whole number.')
      .min(1, 'Use at least 1.')
      .max(99, 'Use 99 or fewer.'),
    firstDue: calendarDateText,
    lastDue: calendarDateText.nullable().default(null),
  }),
]);
export type BillScheduleInput = z.infer<typeof billSchedule>;

const billFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name.')
    .max(BILL_NAME_MAX, `Use ${String(BILL_NAME_MAX)} characters or fewer.`),
  /** Null only for a variable bill with no usual amount. */
  expectedCents: z
    .number()
    .int('Use a whole number of cents.')
    .min(0, 'Use zero or more.')
    .max(MAX_CENTS, 'That amount is too large.')
    .nullable(),
  isVariable: z.boolean(),
  schedule: billSchedule,
  categoryId: z.uuid('Choose a category.').nullable(),
  autopay: z.boolean(),
  url: z
    .url({ protocol: /^https?$/, error: 'Use a web address starting with https://' })
    .max(500, 'That address is too long.')
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(BILL_NOTES_MAX, `Use ${String(BILL_NOTES_MAX)} characters or fewer.`)
    .nullable(),
};

const needsAmount = (bill: {
  isVariable?: boolean | undefined;
  expectedCents?: number | null | undefined;
}) => bill.isVariable === true || bill.expectedCents !== null;
const AMOUNT_NEEDED = { path: ['expectedCents'], error: 'Enter an amount, or mark it as varying.' };

export const createBillRequest = z.object(billFields).refine(needsAmount, AMOUNT_NEEDED);

export const updateBillRequest = z
  .object({ ...billFields, archived: z.boolean() })
  .partial()
  .refine(
    (bill) =>
      bill.expectedCents === undefined || bill.isVariable === undefined || needsAmount(bill),
    AMOUNT_NEEDED,
  );

export const billParams = z.object({ billId: z.uuid('That isn’t a valid bill.') });

/** Moves a bill between the person's personal space and their household. */
export const moveBillRequest = z.object({ toSpaceId: z.uuid('Choose where it goes.') });

export const billResponse = z.object({
  id: z.string(),
  spaceId: z.string(),
  /** Personal bills are only ever seen by their owner. */
  shared: z.boolean(),
  name: z.string(),
  expectedCents: z.number().nullable(),
  isVariable: z.boolean(),
  schedule: billSchedule,
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  autopay: z.boolean(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  archived: z.boolean(),
});
export type BillResponse = z.infer<typeof billResponse>;

export const agendaQuery = z.object({ from: calendarDateText, to: calendarDateText });

export const agendaEntry = z.object({
  id: z.string(),
  billId: z.string(),
  shared: z.boolean(),
  name: z.string(),
  dueOn: z.string(),
  expectedCents: z.number().nullable(),
  isVariable: z.boolean(),
  categoryName: z.string().nullable(),
  state: z.enum(['open', 'settled', 'skipped']),
  /** What's been paid toward it, never counting voided payments. */
  paidCents: z.number(),
});
export type AgendaEntry = z.infer<typeof agendaEntry>;

export const agendaResponse = z.object({
  /** Open and due before today, wherever they fall, so nothing overdue is out of view. */
  overdue: z.array(agendaEntry),
  /** Everything due in the range asked for, from today on. */
  upcoming: z.array(agendaEntry),
});
export type AgendaResponse = z.infer<typeof agendaResponse>;
