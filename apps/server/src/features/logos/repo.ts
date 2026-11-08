import { createHash } from 'node:crypto';
import { bill, logo, type Orm, type Transaction } from '@remidy/db';
import { imageTypeOf, logoProblem } from '@remidy/domain';
import { and, eq, lt, notExists, sql } from 'drizzle-orm';
import { AppError } from '../../core/errors.ts';

/**
 * Stores a logo once by its contents, and returns its ID. The same image stored twice gets the
 * same ID. Its type comes from its bytes, never from what a website or browser claimed.
 */
export async function storeLogo(orm: Orm | Transaction, bytes: Buffer): Promise<string> {
  const problem = logoProblem(bytes);
  const contentType = imageTypeOf(bytes);
  if (problem || !contentType) {
    throw new AppError(422, 'invalid', problem ?? 'That image can’t be used.', [
      { path: 'image', message: problem ?? 'That image can’t be used.' },
    ]);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const [inserted] = await orm
    .insert(logo)
    .values({ sha256, contentType, bytes })
    .onConflictDoNothing({ target: logo.sha256 })
    .returning({ id: logo.id });
  if (inserted) return inserted.id;
  const [existing] = await orm.select({ id: logo.id }).from(logo).where(eq(logo.sha256, sha256));
  if (!existing) throw new Error('The logo was not stored.');
  return existing.id;
}

export async function readLogo(orm: Orm, logoId: string) {
  const [row] = await orm
    .select({ contentType: logo.contentType, bytes: logo.bytes })
    .from(logo)
    .where(eq(logo.id, logoId));
  return row ?? null;
}

/** Whether a logo exists, for features that point at one. */
export async function logoExists(orm: Orm | Transaction, logoId: string): Promise<boolean> {
  const [row] = await orm.select({ id: logo.id }).from(logo).where(eq(logo.id, logoId));
  return row !== undefined;
}

/**
 * Deletes logos no bill has used for a day. Logos found while someone was choosing, and never
 * chosen, end up here. A day's wait means one being chosen right now isn't removed under them.
 */
export async function deleteUnusedLogos(orm: Orm): Promise<number> {
  const deleted = await orm
    .delete(logo)
    .where(
      and(
        lt(logo.createdAt, sql`now() - interval '1 day'`),
        notExists(orm.select({ id: bill.id }).from(bill).where(eq(bill.logoId, logo.id))),
      ),
    )
    .returning({ id: logo.id });
  return deleted.length;
}
