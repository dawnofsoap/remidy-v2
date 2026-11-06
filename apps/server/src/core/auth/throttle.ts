import { loginThrottle, type Orm } from '@remidy/db';
import { and, eq, sql } from 'drizzle-orm';

export const MAX_FAILED_SIGN_INS = 5;
export const THROTTLE_MINUTES = 15;

/** Emails are matched without regard to case or surrounding spaces. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const matches = (email: string, address: string) =>
  and(eq(loginThrottle.email, normalizeEmail(email)), eq(loginThrottle.address, address));

export async function isLockedOut(orm: Orm, email: string, address: string): Promise<boolean> {
  const [row] = await orm
    .select({ lockedUntil: loginThrottle.lockedUntil })
    .from(loginThrottle)
    .where(matches(email, address));
  return Boolean(row?.lockedUntil && row.lockedUntil > new Date());
}

/**
 * Counts a failure in one atomic statement, so simultaneous attempts can't slip past the limit.
 * Failures older than the window stop counting, and reaching the limit locks that email for that
 * address.
 */
export async function recordFailedSignIn(orm: Orm, email: string, address: string): Promise<void> {
  const window = sql.raw(`interval '${String(THROTTLE_MINUTES)} minutes'`);
  const limit = MAX_FAILED_SIGN_INS;
  const isStale = sql`login_throttle.window_started_at < now() - ${window}`;
  const nextCount = sql`case when ${isStale} then 1 else login_throttle.failed_count + 1 end`;

  await orm
    .insert(loginThrottle)
    .values({ email: normalizeEmail(email), address, failedCount: 1 })
    .onConflictDoUpdate({
      target: [loginThrottle.email, loginThrottle.address],
      set: {
        failedCount: nextCount,
        windowStartedAt: sql`case when ${isStale} then now() else login_throttle.window_started_at end`,
        lockedUntil: sql`case when ${nextCount} >= ${limit} then now() + ${window} else null end`,
      },
    });
}

export async function clearFailedSignIns(orm: Orm, email: string, address: string): Promise<void> {
  await orm.delete(loginThrottle).where(matches(email, address));
}

/** Everywhere, once someone has proved they own the account some other way. */
export async function clearAllFailedSignIns(orm: Orm, email: string): Promise<void> {
  await orm.delete(loginThrottle).where(eq(loginThrottle.email, normalizeEmail(email)));
}
