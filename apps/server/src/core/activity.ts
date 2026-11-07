import { activityLog, user, type Orm, type Transaction } from '@remidy/db';
import { and, desc, eq, lt } from 'drizzle-orm';

// Anything like this in a log would outlive the secret itself, because the log is never rewritten.
const SECRET_FIELD = /pass(word|code)|secret|token|credential|(api|private)[-_]?key|hash/i;

export interface ActivityEntry {
  spaceId: string;
  /** Who did it, or null when Remidy did it itself, such as a scheduled job. */
  actorId: string | null;
  /** What kind of thing changed, such as `space` or `bill`. */
  entity: string;
  entityId: string;
  /** What happened, such as `updated` or `voided`. */
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

function refuseSecrets(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(refuseSecrets);
  } else if (typeof value === 'object' && value !== null) {
    for (const [field, inner] of Object.entries(value)) {
      if (SECRET_FIELD.test(field)) {
        throw new Error(`"${field}" looks like a secret, so it can't go in the activity log.`);
      }
      refuseSecrets(inner);
    }
  }
}

/**
 * Records a change. It takes a transaction rather than a database connection, so that the change
 * and its record are saved together or not at all.
 */
export async function recordActivity(
  transaction: Transaction,
  { before = null, after = null, ...entry }: ActivityEntry,
): Promise<void> {
  refuseSecrets(before);
  refuseSecrets(after);
  await transaction.insert(activityLog).values({ ...entry, before, after });
}

/** A space's history, newest first. It only ever reads the space it's given. */
export async function listActivity(
  orm: Orm,
  spaceId: string,
  { before, limit }: { before?: string | undefined; limit: number },
) {
  const rows = await orm
    .select({
      id: activityLog.id,
      entity: activityLog.entity,
      entityId: activityLog.entityId,
      action: activityLog.action,
      actorName: user.name,
      before: activityLog.before,
      after: activityLog.after,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .where(
      and(
        eq(activityLog.spaceId, spaceId),
        before === undefined ? undefined : lt(activityLog.id, before),
      ),
    )
    .orderBy(desc(activityLog.id))
    // One extra, to find out whether there's another page.
    .limit(limit + 1);

  const entries = rows.slice(0, limit);
  return {
    entries: entries.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextBefore: rows.length > limit ? (entries.at(-1)?.id ?? null) : null,
  };
}
