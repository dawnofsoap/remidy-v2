import { membership, space, user, type Orm } from '@remidy/db';
import { asc, eq, sql } from 'drizzle-orm';

const spaceColumns = {
  id: space.id,
  name: space.name,
  kind: space.kind,
  timeZone: space.timeZone,
  role: membership.role,
};

/** Only the spaces this person belongs to. */
export function listSpacesFor(orm: Orm, userId: string) {
  return orm
    .select(spaceColumns)
    .from(membership)
    .innerJoin(space, eq(space.id, membership.spaceId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(space.createdAt));
}

export async function getSpace(orm: Orm, spaceId: string) {
  const [row] = await orm
    .select({ id: space.id, name: space.name, kind: space.kind, timeZone: space.timeZone })
    .from(space)
    .where(eq(space.id, spaceId));
  return row;
}

export async function updateSpace(
  orm: Orm,
  spaceId: string,
  changes: { name?: string | undefined; timeZone?: string | undefined },
) {
  const [row] = await orm
    .update(space)
    .set({
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.timeZone === undefined ? {} : { timeZone: changes.timeZone }),
      updatedAt: sql`now()`,
    })
    .where(eq(space.id, spaceId))
    .returning({ id: space.id, name: space.name, kind: space.kind, timeZone: space.timeZone });
  return row;
}

export function listMembers(orm: Orm, spaceId: string) {
  return orm
    .select({ userId: user.id, name: user.name, email: user.email, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.spaceId, spaceId))
    .orderBy(asc(user.name));
}
