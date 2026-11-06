import { loginThrottle, rateLimit, session, verification, type Orm } from '@remidy/db';
import { and, isNull, lt, or, sql } from 'drizzle-orm';
import { defineJob } from '../jobs.ts';
import { LONGEST_RATE_LIMIT_SECONDS } from './index.ts';
import { THROTTLE_MINUTES } from './throttle.ts';

/** Deletes sign-in records that can no longer affect anything. */
export async function cleanUpSignInRecords(orm: Orm): Promise<void> {
  const window = sql.raw(`interval '${String(THROTTLE_MINUTES)} minutes'`);
  await orm
    .delete(loginThrottle)
    .where(
      and(
        lt(loginThrottle.windowStartedAt, sql`now() - ${window}`),
        or(isNull(loginThrottle.lockedUntil), lt(loginThrottle.lockedUntil, sql`now()`)),
      ),
    );
  await orm
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, Date.now() - LONGEST_RATE_LIMIT_SECONDS * 1000));
  await orm.delete(verification).where(lt(verification.expiresAt, sql`now()`));
  await orm.delete(session).where(lt(session.expiresAt, sql`now()`));
}

export function signInCleanupJob(orm: Orm) {
  return defineJob({
    name: 'sign-in-cleanup',
    description: 'Removes expired sessions, lockouts and reset links.',
    cron: '17 * * * *',
    everyMinutes: 60,
    run: () => cleanUpSignInRecords(orm),
  });
}
