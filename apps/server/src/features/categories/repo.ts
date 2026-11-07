import { category, type Orm, type Transaction } from '@remidy/db';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { recordActivity } from '../../core/activity.ts';
import { AppError } from '../../core/errors.ts';

const columns = {
  id: category.id,
  name: category.name,
  archived: isNotNull(category.archivedAt).mapWith(Boolean),
};

interface Category {
  id: string;
  name: string;
  archived: boolean;
}

const NOT_FOUND = new AppError(404, 'not_found', 'That category wasn’t found.');
const duplicate = (name: string) =>
  new AppError(409, 'duplicate', `There’s already a category named “${name}”.`, [
    { path: 'name', message: 'There’s already a category with this name.' },
  ]);

/** Postgres reports a broken unique rule with this code. Drizzle may wrap the error. */
function isDuplicate(error: unknown): boolean {
  const code = (value: unknown) => (value as { code?: unknown } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
}

/** Runs a change, turning a duplicate name into an answer the person can act on. */
async function guardDuplicate<T>(name: string | undefined, change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (name !== undefined && isDuplicate(error)) throw duplicate(name);
    throw error;
  }
}

/** Every category in the space, archived ones included, in name order regardless of case. */
export function listCategories(orm: Orm, spaceId: string): Promise<Category[]> {
  return orm
    .select(columns)
    .from(category)
    .where(eq(category.spaceId, spaceId))
    .orderBy(sql`lower(${category.name})`, asc(category.name));
}

export function createCategory(
  orm: Orm,
  spaceId: string,
  actorId: string,
  name: string,
): Promise<Category> {
  return guardDuplicate(name, () =>
    orm.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(category)
        .values({ spaceId, name })
        .returning(columns);
      if (!created) throw new Error('The category was not created.');
      await recordActivity(transaction, {
        spaceId,
        actorId,
        entity: 'category',
        entityId: created.id,
        action: 'created',
        before: null,
        after: { name },
      });
      return created;
    }),
  );
}

async function lockCategory(transaction: Transaction, spaceId: string, categoryId: string) {
  const [current] = await transaction
    .select(columns)
    .from(category)
    .where(and(eq(category.spaceId, spaceId), eq(category.id, categoryId)))
    .for('update');
  if (!current) throw NOT_FOUND;
  return current;
}

/** Renames, archives or restores, and records only what actually changed. */
export function updateCategory(
  orm: Orm,
  spaceId: string,
  categoryId: string,
  actorId: string,
  changes: { name?: string | undefined; archived?: boolean | undefined },
): Promise<Category> {
  return guardDuplicate(changes.name, () =>
    orm.transaction(async (transaction) => {
      const current = await lockCategory(transaction, spaceId, categoryId);
      const fields = (['name', 'archived'] as const).filter(
        (field) => changes[field] !== undefined && changes[field] !== current[field],
      );
      if (fields.length === 0) return current;

      const [updated] = await transaction
        .update(category)
        .set({
          ...(fields.includes('name') ? { name: changes.name } : {}),
          ...(fields.includes('archived')
            ? { archivedAt: changes.archived ? sql`now()` : null }
            : {}),
        })
        .where(and(eq(category.spaceId, spaceId), eq(category.id, categoryId)))
        .returning(columns);
      if (!updated) throw NOT_FOUND;

      await recordActivity(transaction, {
        spaceId,
        actorId,
        entity: 'category',
        entityId: categoryId,
        action: 'updated',
        before: Object.fromEntries(fields.map((field) => [field, current[field]])),
        after: Object.fromEntries(fields.map((field) => [field, updated[field]])),
      });
      return updated;
    }),
  );
}

/**
 * Deletes a category. Once bills can use one, a category with history will be refused here and
 * archived instead.
 */
export function deleteCategory(
  orm: Orm,
  spaceId: string,
  categoryId: string,
  actorId: string,
): Promise<void> {
  return orm.transaction(async (transaction) => {
    const current = await lockCategory(transaction, spaceId, categoryId);
    await transaction
      .delete(category)
      .where(and(eq(category.spaceId, spaceId), eq(category.id, categoryId)));
    await recordActivity(transaction, {
      spaceId,
      actorId,
      entity: 'category',
      entityId: categoryId,
      action: 'deleted',
      before: { name: current.name, archived: current.archived },
      after: null,
    });
  });
}
