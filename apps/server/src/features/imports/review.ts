import {
  createBillRequest,
  type ImportBillStatus,
  type ImportPreviewBill,
} from '@remidy/contracts';
import {
  addMonthsFromAnchor,
  describeSchedule,
  dueDates,
  hasEnded,
  NotAV1Export,
  readV1Export,
  type CalendarDate,
  type ImportedBill,
  type Schedule,
  type V1Import,
} from '@remidy/domain';
import { AppError } from '../../core/errors.ts';
import type { SpaceRole } from '../../core/feature.ts';

// Reading and checking a v1 export, with nothing saved. The saving is in repo.ts.

export interface ImportSpace {
  id: string;
  role: SpaceRole;
  timeZone: string;
}

export const invalid = (path: string, message: string) =>
  new AppError(422, 'invalid', message, [{ path, message }]);

/** What the import needs to know about the person, read in the same transaction as it saves. */
export interface Context {
  userId: string;
  personal: ImportSpace;
  household: ImportSpace | null;
  /** Where the person's categories are: the household's, or their own without one. */
  listsSpace: ImportSpace;
  today: CalendarDate;
  billNames: Set<string>;
}

/** A bill from the file, checked by the same rules as adding one by hand. */
export interface Entry {
  index: number;
  bill: ImportedBill;
  status: ImportBillStatus;
  checks: string[];
}

export const nameKey = (name: string) => name.trim().toLocaleLowerCase();

export function readFile(file: unknown): V1Import {
  try {
    return readV1Export(file);
  } catch (error) {
    if (error instanceof NotAV1Export) throw invalid('file', error.message);
    throw error;
  }
}

/** The fields a bill is saved with, before its category and logo are known. */
export const fieldsOf = (bill: ImportedBill, url: string | null) => ({
  name: bill.name,
  expectedCents: bill.cents,
  isVariable: bill.isVariable,
  schedule: bill.schedule,
  categoryId: null,
  autopay: bill.autopay,
  url,
  notes: bill.notes,
});

function statusOf(bill: ImportedBill, context: Context): ImportBillStatus {
  if (bill.archived) return 'archived';
  if (hasEnded(bill.schedule, context.today)) return 'finished';
  if (context.billNames.has(nameKey(bill.name))) return 'duplicate';
  return 'ready';
}

/**
 * Checks each bill against the rules for adding one by hand. A website v2 can't use is left off,
 * and anything else that fails is skipped, saying why.
 */
export function review(imported: V1Import, context: Context) {
  const skipped = [...imported.skipped];
  const entries: Entry[] = [];
  for (const bill of imported.bills) {
    const checks = [...bill.checks];
    let url = bill.url;
    if (url && !createBillRequest.safeParse(fieldsOf(bill, url)).success) {
      if (createBillRequest.safeParse(fieldsOf(bill, null)).success) {
        checks.push(`Its website, “${url}”, isn’t a web address v2 can use, so it’s left off.`);
        url = null;
      }
    }
    const parsed = createBillRequest.safeParse(fieldsOf(bill, url));
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'It doesn’t follow v2’s rules for bills.';
      skipped.push({ name: bill.name, reason: `It can’t be added as it is: ${reason}` });
      continue;
    }
    entries.push({
      index: entries.length,
      bill: { ...bill, url },
      status: statusOf(bill, context),
      checks,
    });
  }
  return { entries, skipped };
}

function nextDue(schedule: Schedule, on: CalendarDate): string | null {
  if (hasEnded(schedule, on)) return null;
  if (schedule.kind === 'once') return schedule.firstDue;
  // Far enough ahead for the longest repeat to come round once.
  const months = (schedule.unit === 'year' ? 12 : 1) * schedule.every + 1;
  return dueDates(schedule, on, addMonthsFromAnchor(on, months))[0] ?? null;
}

export const previewOf = (entry: Entry, context: Context): ImportPreviewBill => ({
  index: entry.index,
  name: entry.bill.name,
  expectedCents: entry.bill.cents,
  isVariable: entry.bill.isVariable,
  schedule: entry.bill.schedule,
  scheduleText: describeSchedule(entry.bill.schedule),
  nextDue: nextDue(entry.bill.schedule, context.today),
  categoryName: entry.bill.categoryName,
  autopay: entry.bill.autopay,
  // Someone without a household gets everything in their own space.
  shared: entry.bill.shared && context.household !== null,
  hasLogo: entry.bill.logo !== null,
  status: entry.status,
  checks: entry.checks,
});
