import { z } from 'zod';
import { calendarDateText } from './bills.ts';

export const PAYMENT_NOTES_MAX = 2000;

// Matches MAX_CENTS in @remidy/domain.
const MAX_CENTS = 99_999_999_999;

const optionalText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `Use ${String(max)} characters or fewer for the ${what}.`)
    .nullable()
    .default(null);

export const recordPaymentRequest = z.object({
  paidOn: calendarDateText,
  amountCents: z
    .number()
    .int('Use a whole number of cents.')
    .min(1, 'Enter an amount above zero.')
    .max(MAX_CENTS, 'That amount is too large.'),
  confirmation: optionalText(100, 'confirmation number'),
  notes: optionalText(PAYMENT_NOTES_MAX, 'notes'),
});

export const voidPaymentRequest = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why it’s being voided.')
    .max(500, 'Use 500 characters or fewer.'),
});

export const occurrenceParams = z.object({
  occurrenceId: z.uuid('That isn’t a valid due date.'),
});
export const paymentParams = z.object({ paymentId: z.uuid('That isn’t a valid payment.') });

export const paymentResponse = z.object({
  id: z.string(),
  occurrenceId: z.string(),
  paidOn: z.string(),
  amountCents: z.number(),
  source: z.enum(['manual', 'autopay', 'v1_archive']),
  /** Who recorded it, or null when it was Remidy itself, such as auto-pay. */
  paidByName: z.string().nullable(),
  confirmation: z.string().nullable(),
  notes: z.string().nullable(),
  voided: z.boolean(),
  voidReason: z.string().nullable(),
  voidedByName: z.string().nullable(),
});
export type PaymentResponse = z.infer<typeof paymentResponse>;

/** A due date with its payments, for a bill's history. */
export const historyEntry = z.object({
  id: z.string(),
  dueOn: z.string(),
  expectedCents: z.number().nullable(),
  isVariable: z.boolean(),
  state: z.enum(['open', 'settled', 'skipped']),
  payments: z.array(paymentResponse),
});
export type HistoryEntry = z.infer<typeof historyEntry>;

export const historyResponse = z.array(historyEntry);
