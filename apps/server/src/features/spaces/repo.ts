import { membership, space, user, type Orm } from '@remidy/db';
import { asc, eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../core/activity.ts';

const ownColumns = {
  id: space.id,
  name: space.name,
  kind: space.kind,
  timeZone: space.timeZone,
};

/** Only the spaces this person belongs to. */
export function listSpacesFor(orm: Orm, userId: string) {
  return orm
    .select({ ...ownColumns, role: membership.role })
    .from(membership)
    .innerJoin(space, eq(space.id, membership.spaceId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(space.createdAt));
}

export async function getSpace(orm: Orm, spaceId: string) {
  const [row] = await orm.select(ownColumns).from(space).where(eq(space.id, spaceId));
  return row;
}

/** Saves the change and its record together, and records only what actually changed. */
export async function updateSpace(
  orm: Orm,
  spaceId: string,
  actorId: string,
  changes: { name?: string | undefined; timeZone?: string | undefined },
) {
  return orm.transaction(async (transaction) => {
    const [current] = await transaction
      .select(ownColumns)
      .from(space)
      .where(eq(space.id, spaceId))
      .for('update');
    if (!current) return undefined;

    const fields = ['name', 'timeZone'] as const;
    const changed = fields.filter(
      (field) => changes[field] !== undefined && changes[field] !== current[field],
    );
    if (changed.length === 0) return current;

    const [updated] = await transaction
      .update(space)
      .set({
        ...Object.fromEntries(changed.map((field) => [field, changes[field]])),
        updatedAt: sql`now()`,
      })
      .where(eq(space.id, spaceId))
      .returning(ownColumns);

    await recordActivity(transaction, {
      spaceId,
      actorId,
      entity: 'space',
      entityId: spaceId,
      action: 'updated',
      before: Object.fromEntries(changed.map((field) => [field, current[field]])),
      after: Object.fromEntries(changed.map((field) => [field, updated?.[field]])),
    });
    return updated;
  });
}

export function listMembers(orm: Orm, spaceId: string) {
  return orm
    .select({ userId: user.id, name: user.name, email: user.email, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.spaceId, spaceId))
    .orderBy(asc(user.name));
}
