import { ADMIN_EMAIL } from '@remidy/contracts';
import { createDatabase, membership, space, user, type Orm } from '@remidy/db';
import { and, eq } from 'drizzle-orm';
import { loadConfig } from './config.ts';
import type { Feature, SampleContext } from './feature.ts';

const HOUSEHOLD_NAME = 'The Example Household';
const PARTNER = { id: 'sample-partner', name: 'Jamie Example', email: 'jamie@example.com' };

/**
 * The people and spaces sample data goes into: the admin's personal space, and a household they
 * own with a made-up second member, so shared screens can be seen before Sharing exists. Safe to
 * run again: what's already there is reused.
 */
async function sampleSpaces(orm: Orm): Promise<Omit<SampleContext, 'fresh'>> {
  const [admin] = await orm.select({ id: user.id }).from(user).where(eq(user.email, ADMIN_EMAIL));
  if (!admin) {
    throw new Error('There’s no admin account yet. Start the server once, then try again.');
  }
  const mine = await orm
    .select({ id: space.id, kind: space.kind })
    .from(membership)
    .innerJoin(space, eq(space.id, membership.spaceId))
    .where(eq(membership.userId, admin.id));
  const personal = mine.find((row) => row.kind === 'personal');
  if (!personal) throw new Error('The admin has no personal space.');

  const household =
    mine.find((row) => row.kind === 'shared') ??
    (await orm.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(space)
        .values({ name: HOUSEHOLD_NAME, kind: 'shared', timeZone: 'America/Chicago' })
        .returning({ id: space.id, kind: space.kind });
      if (!created) throw new Error('The household was not created.');
      await transaction
        .insert(membership)
        .values({ userId: admin.id, spaceId: created.id, role: 'owner' });
      return created;
    }));

  // A second member who can't sign in, so the household isn't just one person.
  await orm.insert(user).values(PARTNER).onConflictDoNothing();
  const [joined] = await orm
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, PARTNER.id), eq(membership.spaceId, household.id)));
  if (!joined) {
    await orm
      .insert(membership)
      .values({ userId: PARTNER.id, spaceId: household.id, role: 'member' });
  }

  return { userId: admin.id, personalSpaceId: personal.id, householdId: household.id };
}

/**
 * Fills a development database with fictional data from every feature that has some, through each
 * feature's own code, so the data follows the same rules as real data. Refuses to run in production.
 */
export async function addSampleData(features: Feature[], argv: string[]): Promise<string[]> {
  const config = loadConfig(process.env);
  if (config.NODE_ENV === 'production') {
    throw new Error('Sample data is for development only, and this is production.');
  }
  const database = createDatabase(config.DATABASE_URL);
  try {
    await database.migrate();
    const context: SampleContext = {
      ...(await sampleSpaces(database.orm)),
      fresh: argv.includes('--fresh'),
    };
    const report: string[] = [`Household: ${HOUSEHOLD_NAME}, with ${PARTNER.name}`];
    for (const feature of features) {
      if (!feature.sampleData) continue;
      report.push(`${feature.name}: ${await feature.sampleData({ database }, context)}`);
    }
    return report;
  } finally {
    await database.close();
  }
}
