import type { ImportPreviewResponse, ImportRequest, ImportResponse } from '@remidy/contracts';
import { membership, space, type Orm, type Transaction } from '@remidy/db';
import { today } from '@remidy/domain';
import { eq } from 'drizzle-orm';
import { AppError } from '../../core/errors.ts';
import { roleAtLeast } from '../../core/spaces.ts';
import { createBill, listBills } from '../bills/index.ts';
import { createCategory, listCategories } from '../categories/index.ts';
import { storeLogo } from '../logos/index.ts';
import {
  fieldsOf,
  invalid,
  nameKey,
  previewOf,
  readFile,
  review,
  type Context,
  type ImportSpace,
} from './review.ts';

/** The person's own space, and their household's if they're in one. */
export async function spacesOf(
  transaction: Transaction,
  userId: string,
): Promise<{ personal: ImportSpace | null; household: ImportSpace | null }> {
  const rows = await transaction
    .select({ id: space.id, kind: space.kind, timeZone: space.timeZone, role: membership.role })
    .from(membership)
    .innerJoin(space, eq(space.id, membership.spaceId))
    .where(eq(membership.userId, userId));
  const pick = (kind: 'personal' | 'shared') => {
    const row = rows.find((candidate) => candidate.kind === kind);
    return row ? { id: row.id, role: row.role, timeZone: row.timeZone } : null;
  };
  return { personal: pick('personal'), household: pick('shared') };
}

async function contextFor(transaction: Transaction, userId: string): Promise<Context> {
  const { personal, household } = await spacesOf(transaction, userId);
  if (!personal) throw new AppError(404, 'not_found', 'Your personal space wasn’t found.');
  const listsSpace = household ?? personal;
  const bills = await listBills(transaction, userId);
  return {
    userId,
    personal,
    household,
    listsSpace,
    today: today(listsSpace.timeZone),
    billNames: new Set(bills.map((bill) => nameKey(bill.name))),
  };
}

/** What importing the file would create. Nothing is saved. */
export function previewImport(
  orm: Orm,
  userId: string,
  file: unknown,
): Promise<ImportPreviewResponse> {
  return orm.transaction(async (transaction) => {
    const context = await contextFor(transaction, userId);
    const imported = readFile(file);
    const { entries, skipped } = review(imported, context);
    const existing = new Set(
      (await listCategories(transaction, context.listsSpace.id)).map((row) => nameKey(row.name)),
    );
    return {
      bills: entries.map((entry) => previewOf(entry, context)),
      skipped,
      categories: imported.categoryNames.map((name) => ({
        name,
        exists: existing.has(nameKey(name)),
      })),
      hasHousehold: context.household !== null,
    };
  });
}

/**
 * Each v1 category's ID in v2: an existing one with the same name, or a new one. An archived match
 * leaves its bills without one, and so does a household where the person can't add categories.
 */
async function categoryIds(transaction: Transaction, context: Context, names: string[]) {
  const ids = new Map<string, string | null>();
  const existing = await listCategories(transaction, context.listsSpace.id);
  let created = 0;
  for (const name of names) {
    const match = existing.find((row) => nameKey(row.name) === nameKey(name));
    if (match) {
      ids.set(nameKey(name), match.archived ? null : match.id);
    } else if (roleAtLeast(context.listsSpace.role, 'manager')) {
      const row = await createCategory(transaction, context.listsSpace.id, context.userId, name);
      ids.set(nameKey(name), row.id);
      created += 1;
    }
  }
  return { ids, created };
}

function targetSpace(context: Context, shared: boolean): string {
  if (!shared) return context.personal.id;
  if (!context.household || !roleAtLeast(context.household.role, 'manager')) {
    throw invalid(
      'bills',
      'You can’t add bills to the household. Import them to your own instead.',
    );
  }
  return context.household.id;
}

/** Imports the chosen bills, and v1's categories, all together or not at all. */
export function importBills(
  orm: Orm,
  userId: string,
  request: ImportRequest,
): Promise<ImportResponse> {
  return orm.transaction(async (transaction) => {
    const context = await contextFor(transaction, userId);
    const imported = readFile(request.file);
    const { entries } = review(imported, context);
    if (new Set(request.bills.map((choice) => choice.index)).size !== request.bills.length) {
      throw invalid('bills', 'A bill was chosen twice.');
    }
    const chosen = request.bills.map((choice) => {
      const entry = entries[choice.index];
      if (!entry) throw invalid('bills', 'A chosen bill isn’t in the file. Review it again.');
      return { entry, spaceId: targetSpace(context, choice.shared) };
    });

    const { ids, created } = await categoryIds(transaction, context, imported.categoryNames);
    for (const { entry, spaceId } of chosen) {
      const { bill } = entry;
      const logoId = bill.logo ? await storeLogo(transaction, Buffer.from(bill.logo)) : null;
      const categoryId = bill.categoryName ? (ids.get(nameKey(bill.categoryName)) ?? null) : null;
      await createBill(
        transaction,
        spaceId,
        userId,
        { ...fieldsOf(bill, bill.url), categoryId, logoId },
        // Earlier due dates were paid in v1, so they don't arrive overdue.
        { fromToday: true, archived: bill.archived },
      );
    }
    return { billCount: chosen.length, categoryCount: created };
  });
}
