import { apiErrorResponse } from '@remidy/contracts';
import { loginThrottle, session, user } from '@remidy/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it, beforeEach } from 'vitest';
import { buildApp } from '../app.ts';
import { cookieFrom, freshAddress, ORIGIN, PERSON, PUBLIC_URL, useAuthHarness } from './testing.ts';
import { MAX_FAILED_SIGN_INS } from './throttle.ts';

const h = useAuthHarness();
const { post, signIn, whoami, signedInCookie, createAccount } = h;

describe('signing in', () => {
  beforeEach(async () => {
    await createAccount();
  });

  it('works with the right password, ignoring email case', async () => {
    const response = await signIn('ALEX@example.com', PERSON.password);
    expect(response.statusCode).toBe(200);
  });

  it('sets a cookie that scripts and other sites cannot use', async () => {
    const response = await signIn(PERSON.email, PERSON.password);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('never returns the password or its hash', async () => {
    const response = await signIn(PERSON.email, PERSON.password);
    expect(response.body).not.toContain(PERSON.password);
    expect(response.body.toLowerCase()).not.toContain('"password"');
    const cookie = cookieFrom(response);
    const current = await h.app.inject({ url: '/api/v1/auth/get-session', headers: { cookie } });
    expect(current.body.toLowerCase()).not.toContain('"password"');
  });

  it('answers the same for a wrong password and an unknown email', async () => {
    const wrong = await signIn(PERSON.email, 'wrong password here');
    const unknown = await signIn('nobody@example.com', 'wrong password here');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(unknown.body).toBe(wrong.body);
  });

  it('cannot be used to create an account', async () => {
    const response = await signIn('new@example.com', PERSON.password);
    expect(response.statusCode).toBe(401);
    expect(await h.test.database.orm.select().from(user)).toHaveLength(1);
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await createAccount();
  });

  it('identifies the caller on signed-in routes', async () => {
    const response = await whoami(await signedInCookie());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: PERSON.email, name: PERSON.name });
  });

  it.each([
    ['no cookie', undefined],
    ['a made-up cookie', '__Secure-better-auth.session_token=made-up.value'],
  ])('refuses %s', async (_name, cookie) => {
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('stops working after signing out', async () => {
    const cookie = await signedInCookie();
    const out = await post('/api/v1/auth/sign-out', {}, { cookie });
    expect(out.statusCode).toBe(200);
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('stops working the moment it is revoked', async () => {
    const phone = await signedInCookie();
    const laptop = await signedInCookie();
    expect(
      (await post('/api/v1/auth/revoke-other-sessions', {}, { cookie: laptop })).statusCode,
    ).toBe(200);
    expect((await whoami(phone)).statusCode).toBe(401);
    expect((await whoami(laptop)).statusCode).toBe(200);
  });

  it('stops working once it expires', async () => {
    const cookie = await signedInCookie();
    await h.test.database.orm.update(session).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('lists sessions without exposing their tokens', async () => {
    const cookie = await signedInCookie();
    const response = await h.app.inject({ url: '/api/v1/auth/list-sessions', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json<unknown[]>()).toHaveLength(1);
  });
});

describe('changing a password', () => {
  beforeEach(async () => {
    await createAccount();
  });
  const change = (cookie: string, currentPassword: string, newPassword: string) =>
    post(
      '/api/v1/auth/change-password',
      { currentPassword, newPassword, revokeOtherSessions: true },
      { cookie },
    );

  it('needs the current password', async () => {
    const response = await change(
      await signedInCookie(),
      'not my password',
      'a brand new passphrase',
    );
    expect(response.statusCode).not.toBe(200);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('needs to be signed in', async () => {
    const response = await post('/api/v1/auth/change-password', {
      currentPassword: PERSON.password,
      newPassword: 'a brand new passphrase',
    });
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ['too short', 'short1!'],
    ['only letters', 'onlylettershere'],
    ['a common word', 'my password is long'],
    ['a repeated pattern', 'abc1abc1abc1'],
    ['too long', 'horse7'.repeat(22)],
  ])('refuses a new password that is %s, and keeps the old one', async (_name, newPassword) => {
    const response = await change(await signedInCookie(), PERSON.password, newPassword);
    expect(response.statusCode).toBe(422);
    const error = apiErrorResponse.parse(response.json()).error;
    expect(error.fields?.[0]?.path).toBe('body.newPassword');
    expect(error.message).not.toContain(newPassword);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('refuses the same password again', async () => {
    const response = await change(await signedInCookie(), PERSON.password, PERSON.password);
    expect(response.statusCode).toBe(422);
  });

  it('replaces the old password and signs out other devices', async () => {
    const other = await signedInCookie();
    const current = await signedInCookie();
    expect((await change(current, PERSON.password, 'a brand new passphrase')).statusCode).toBe(200);

    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(401);
    expect((await signIn(PERSON.email, 'a brand new passphrase')).statusCode).toBe(200);
    expect((await whoami(other)).statusCode).toBe(401);
  });
});

describe('account lockout', () => {
  beforeEach(async () => {
    await createAccount();
  });
  const failTimes = async (count: number, email = PERSON.email) => {
    for (let i = 0; i < count; i += 1) {
      expect((await signIn(email, 'wrong password here')).statusCode).toBe(401);
    }
  };

  it('locks after repeated failures, even with the right password', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    const response = await signIn(PERSON.email, PERSON.password);
    expect(response.statusCode).toBe(429);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('too_many_attempts');
  });

  it('ignores the case of the email', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    expect((await signIn('  ALEX@EXAMPLE.COM ', PERSON.password)).statusCode).toBe(429);
  });

  it('cannot be used by a stranger to lock the real person out', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(429);
    h.address = freshAddress();
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('does not let a success elsewhere clear a stranger’s lock', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    const stranger = h.address;
    h.address = freshAddress();
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
    h.address = stranger;
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(429);
  });

  it('locks unknown emails the same way, so it reveals nothing', async () => {
    await failTimes(MAX_FAILED_SIGN_INS, 'nobody@example.com');
    expect((await signIn('nobody@example.com', 'wrong password here')).statusCode).toBe(429);
  });

  it('does not affect other accounts', async () => {
    await failTimes(MAX_FAILED_SIGN_INS, 'nobody@example.com');
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('allows sign-in one failure below the limit, which then clears the count', async () => {
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('ends when the lock runs out', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    await h.test.database.orm
      .update(loginThrottle)
      .set({ lockedUntil: new Date(Date.now() - 1000), windowStartedAt: new Date(0) })
      .where(eq(loginThrottle.email, PERSON.email));
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(200);
  });

  it('forgets failures older than the window', async () => {
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    await h.test.database.orm
      .update(loginThrottle)
      .set({ windowStartedAt: new Date(0) })
      .where(eq(loginThrottle.email, PERSON.email));
    await failTimes(1);
    const [row] = await h.test.database.orm.select().from(loginThrottle);
    expect(row?.failedCount).toBe(1);
    expect(row?.lockedUntil).toBeNull();
  });

  it('cannot be raced past with simultaneous attempts', async () => {
    await Promise.all(
      Array.from({ length: 12 }, () => signIn(PERSON.email, 'wrong password here')),
    );
    const [row] = await h.test.database.orm.select().from(loginThrottle);
    expect(row?.lockedUntil).not.toBeNull();
    expect((await signIn(PERSON.email, PERSON.password)).statusCode).toBe(429);
  });
});

describe('rate limiting', () => {
  beforeEach(async () => {
    await createAccount();
  });
  const attempt = (i: number, headers: Record<string, string> = {}) =>
    post(
      '/api/v1/auth/sign-in/email',
      { email: `person${String(i)}@example.com`, password: 'wrong password here' },
      headers,
    );

  it('limits many attempts from one address, across different emails', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) statuses.push((await attempt(i)).statusCode);
    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(20).every((status) => status === 429)).toBe(true);
  });

  it('cannot be dodged by faking a forwarding header', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const headers = {
        'x-forwarded-for': `203.0.113.${String(i)}`,
        'x-remidy-client-ip': `198.51.100.${String(i)}`,
      };
      statuses.push((await attempt(i, headers)).statusCode);
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it('does not limit a different address', async () => {
    for (let i = 0; i < 25; i += 1) await attempt(i);
    h.address = freshAddress();
    expect((await attempt(99)).statusCode).toBe(401);
  });
});

describe('the sign-in routes’ own rate limit', () => {
  it('refuses attempts over the limit, before they reach the database', async () => {
    const orm = h.test.database.orm;
    const limited = buildApp({
      database: h.test.database,
      auth: { auth: h.auth, orm },
      publicUrl: PUBLIC_URL,
      authRequestsPerMinute: 2,
    });
    const hit = () =>
      limited.inject({
        method: 'POST',
        url: '/api/v1/auth/sign-in/email',
        remoteAddress: '10.2.0.1',
        headers: ORIGIN,
        payload: { email: 'nobody@example.com', password: 'wrong password here' },
      });
    expect((await hit()).statusCode).toBe(401);
    expect((await hit()).statusCode).toBe(401);

    const refused = await hit();
    expect(refused.statusCode).toBe(429);
    expect(apiErrorResponse.parse(refused.json()).error.code).toBe('too_many_requests');

    // The refused attempt never reached the lockout count.
    const rows = await orm.select().from(loginThrottle);
    expect(rows[0]?.failedCount).toBe(2);
    await limited.close();
  });

  it('is counted apart from the general limit', async () => {
    const limited = buildApp({
      database: h.test.database,
      auth: { auth: h.auth, orm: h.test.database.orm },
      publicUrl: PUBLIC_URL,
      requestsPerMinute: 1,
      authRequestsPerMinute: 2,
    });
    const from = { remoteAddress: '10.2.0.2' };
    const session = () => limited.inject({ url: '/api/v1/auth/get-session', ...from });

    expect((await limited.inject({ url: '/api/v1/features', ...from })).statusCode).toBe(200);
    expect((await limited.inject({ url: '/api/v1/features', ...from })).statusCode).toBe(429);

    expect((await session()).statusCode).toBe(200);
    expect((await session()).statusCode).toBe(200);
    expect((await session()).statusCode).toBe(429);
    await limited.close();
  });
});

describe('what is reachable', () => {
  beforeEach(async () => {
    await createAccount();
  });

  it.each([
    ['POST', '/api/v1/auth/sign-up/email'],
    ['POST', '/api/v1/auth/update-user'],
    ['POST', '/api/v1/auth/delete-user'],
    ['POST', '/api/v1/auth/change-email'],
    ['GET', '/api/v1/auth/ok'],
    ['GET', '/api/v1/auth/error'],
    ['GET', '/api/v1/auth/sign-in/email'],
    ['GET', '/api/v1/auth/constructor'],
    ['GET', '/api/v1/auth/__proto__'],
  ] as const)('%s %s does not exist', async (method, url) => {
    const cookie = await signedInCookie();
    const response = await h.app.inject({
      method,
      url,
      headers: { ...ORIGIN, cookie },
      ...(method === 'POST' ? { payload: { name: 'x', isInstanceAdmin: true } } : {}),
    });
    expect(response.statusCode).toBe(404);
  });

  it('cannot create an account through public sign-up', async () => {
    const response = await post('/api/v1/auth/sign-up/email', {
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'a long enough password',
    });
    expect(response.statusCode).toBe(404);
    expect(await h.test.database.orm.select().from(user)).toHaveLength(1);
  });
});

describe('requests from other sites', () => {
  beforeEach(async () => {
    await createAccount();
  });

  it('refuses a change from another origin, with a valid cookie', async () => {
    const cookie = await signedInCookie();
    const response = await post(
      '/api/v1/change-something',
      {},
      { cookie, origin: 'https://evil.test' },
    );
    expect(response.statusCode).toBe(403);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('bad_origin');
  });

  it('refuses a change with a cookie and no origin', async () => {
    const cookie = await signedInCookie();
    const response = await h.app.inject({
      method: 'POST',
      url: '/api/v1/change-something',
      payload: {},
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows a change from this site', async () => {
    const cookie = await signedInCookie();
    expect((await post('/api/v1/change-something', {}, { cookie })).statusCode).toBe(200);
  });

  it('refuses sign-in from another origin', async () => {
    const evil = { origin: 'https://evil.test' };
    const body = { email: PERSON.email, password: PERSON.password };
    expect((await post('/api/v1/auth/sign-in/email', body, evil)).statusCode).toBe(403);
  });
});
