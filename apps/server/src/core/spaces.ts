import { membership, space, type Orm } from '@remidy/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { SpaceRole } from './feature.ts';

const RANK: Record<SpaceRole, number> = { member: 1, manager: 2, owner: 3 };

export function roleAtLeast(role: SpaceRole, required: SpaceRole): boolean {
  return RANK[role] >= RANK[required];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's role in a space, or null if they aren't in it or it doesn't exist. */
export async function findMembership(
  orm: Orm,
  userId: string,
  spaceId: string,
): Promise<SpaceRole | null> {
  if (!UUID.test(spaceId)) return null;
  const [row] = await orm
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.spaceId, spaceId)));
  return row?.role ?? null;
}

/** Creates a person's private space. Both rows are written together or not at all. */
export async function createPersonalSpace(orm: Orm, userId: string): Promise<void> {
  await orm.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(space)
      .values({ name: 'Personal', kind: 'personal' })
      .returning({ id: space.id });
    if (!created) throw new Error('The space was not created.');
    await transaction.insert(membership).values({ userId, spaceId: created.id, role: 'owner' });
  });
}

export async function setUserSpacesTimeZone(
  orm: Orm,
  userId: string,
  timeZone: string,
): Promise<void> {
  const owned = orm
    .select({ id: membership.spaceId })
    .from(membership)
    .where(eq(membership.userId, userId));
  await orm.update(space).set({ timeZone }).where(inArray(space.id, owned));
}
