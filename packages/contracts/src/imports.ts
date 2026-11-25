import { z } from 'zod';
import { billSchedule } from './bills.ts';

/**
 * Importing bills from v1's data export. The file is read in memory and never stored, so the
 * review sends it once to see what would be created, then again with the person's choices.
 */

/** v1's export as uploaded. It's checked by the server's reader, not here. */
const v1Export = z.unknown().refine((value) => value !== undefined, 'Choose v1’s export file.');

export const importPreviewRequest = z.object({ file: v1Export });

/**
 * - `ready`: imported unless left out.
 * - `duplicate`: a bill with the same name is already in v2.
 * - `finished`: it has no due dates left.
 * - `archived`: stopped in v1, and imported archived if included.
 */
export const importBillStatus = z.enum(['ready', 'duplicate', 'finished', 'archived']);
export type ImportBillStatus = z.infer<typeof importBillStatus>;

export const importPreviewBill = z.object({
  /** Its place in the export, which the choices refer to. */
  index: z.number(),
  name: z.string(),
  expectedCents: z.number().nullable(),
  isVariable: z.boolean(),
  schedule: billSchedule,
  /** The schedule in words, such as "Every month on the 15th". */
  scheduleText: z.string(),
  /** Its next due date in v2, or null when it has none. */
  nextDue: z.string().nullable(),
  categoryName: z.string().nullable(),
  autopay: z.boolean(),
  /** Whether it goes to the household, as it was in v1. */
  shared: z.boolean(),
  hasLogo: z.boolean(),
  status: importBillStatus,
  /** Things to check, in words. */
  checks: z.array(z.string()),
});
export type ImportPreviewBill = z.infer<typeof importPreviewBill>;

export const importPreviewResponse = z.object({
  bills: z.array(importPreviewBill),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
  /** v1's categories, and whether each is already in v2 or will be added. */
  categories: z.array(z.object({ name: z.string(), exists: z.boolean() })),
  /** Whether the person has a household to import into. */
  hasHousehold: z.boolean(),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponse>;

export const importRequest = z.object({
  file: v1Export,
  /** The bills to import, each to the household or not. Any left out aren't imported. */
  bills: z
    .array(z.object({ index: z.number().int().min(0), shared: z.boolean() }))
    .min(1, 'Choose at least one bill to import.')
    .max(1000),
});
export type ImportRequest = z.infer<typeof importRequest>;

export const importResponse = z.object({
  billCount: z.number(),
  categoryCount: z.number(),
});
export type ImportResponse = z.infer<typeof importResponse>;
