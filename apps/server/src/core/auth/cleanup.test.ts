import { loginThrottle, rateLimit, session, user, verification } from '@remidy/db';
import { describe, expect, it } from 'vitest';
import { cleanUpSignInRecords, signInCleanupJob } from './cleanup.ts';
import { LONGEST_RATE_LIMIT_SECONDS } from './index.ts';
import { MAX_FAILED_SIGN_INS, THROTTLE_MINUTES } from './throttle.ts';
import { PERSON, useAuthHarness } from './testing.ts';

const h = useAuthHarness();
const orm = () => h.test.database.orm;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const minutesAhead = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe('cleaning up sign-in records', () => {
  describe('failed sign-in counts', () => {
    const add = (email: string, windowStartedAt: Date, lockedUntil: Date | null) =>
      orm().insert(loginThrottle).values({
        email,
        address: '10.0.0.1',
        failedCount: MAX_FAILED_SIGN_INS,
        windowStartedAt,
        lockedUntil,
      });
    const left = async () =>
      (await orm().select().from(loginThrottle)).map((row) => row.email).sort();

    it('removes old counts and finished locks, and keeps what still matters', async () => {
      await add('old@example.com', minutesAgo(THROTTLE_MINUTES + 1), null);
      await add('finished@example.com', minutesAgo(THROTTLE_MINUTES + 1), minutesAgo(1));
      await add('recent@example.com', minutesAgo(THROTTLE_MINUTES - 1), null);
      await add('locked@example.com', minutesAgo(THROTTLE_MINUTES + 1), minutesAhead(1));

      await cleanUpSignInRecords(orm());
      expect(await left()).toEqual(['locked@example.com', 'recent@example.com']);
    });

    it('leaves a lock working', async () => {
      await h.createAccount();
      for (let i = 0; i < MAX_FAILED_SIGN_INS; i += 1) {
        await h.signIn(PERSON.email, 'wrong password here');
      }
      await cleanUpSignInRecords(orm());
      expect((await h.signIn(PERSON.email, PERSON.password)).statusCode).toBe(429);
    });
  });

  it('removes rate limit records only once the longest limit has passed', async () => {
    const now = Date.now();
    const longest = LONGEST_RATE_LIMIT_SECONDS * 1000;
    await orm()
      .insert(rateLimit)
      .values([
        { id: 'old', key: 'old', count: 1, lastRequest: now - longest - 60_000 },
        { id: 'current', key: 'current', count: 1, lastRequest: now - longest + 60_000 },
      ]);
    await cleanUpSignInRecords(orm());
    const rows = await orm().select().from(rateLimit);
    expect(rows.map((row) => row.key)).toEqual(['current']);
  });

  it('removes expired reset links, and keeps live ones', async () => {
    await orm()
      .insert(verification)
      .values([
        { id: 'old', identifier: 'old', value: 'x', expiresAt: minutesAgo(1) },
        { id: 'live', identifier: 'live', value: 'x', expiresAt: minutesAhead(1) },
      ]);
    await cleanUpSignInRecords(orm());
    const rows = await orm().select().from(verification);
    expect(rows.map((row) => row.identifier)).toEqual(['live']);
  });

  it('removes expired sessions, and leaves a live one signed in', async () => {
    await h.createAccount();
    const cookie = await h.signedInCookie();
    const [person] = await orm().select().from(user);
    await orm()
      .insert(session)
      .values({
        id: 'expired',
        token: 'expired',
        userId: person?.id ?? '',
        expiresAt: minutesAgo(1),
      });

    await cleanUpSignInRecords(orm());
    const rows = await orm().select().from(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).not.toBe('expired');
    expect((await h.whoami(cookie)).statusCode).toBe(200);
  });

  it('is what the scheduled job does', async () => {
    await orm()
      .insert(verification)
      .values({ id: 'old', identifier: 'old', value: 'x', expiresAt: minutesAgo(1) });
    await signInCleanupJob(orm()).run();
    expect(await orm().select().from(verification)).toHaveLength(0);
  });

  it('does nothing harmful when there is nothing to do', async () => {
    await expect(cleanUpSignInRecords(orm())).resolves.toBeUndefined();
  });
});
