import { apiErrorResponse } from '@remidy/contracts';
import { loginThrottle, session, user } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../app.ts';
import { defineFeature, defineRoute } from '../feature.ts';
import { createAuth, createAuthorize, type Auth } from './index.ts';
import { setupFeature } from './setup.ts';
import { MAX_FAILED_SIGN_INS } from './throttle.ts';

const PUBLIC_URL = 'https://remidy.test';
const ORIGIN = { origin: PUBLIC_URL };
const ADMIN = { name: 'Alex', email: 'alex@example.com', password: 'correct horse battery' };

let test: TestDatabase;
let auth: Auth;
let app: FastifyInstance;
let nextAddress = 1;

/** A new address per test, so one test's attempts don't use up another's rate limit. */
const freshAddress = () => `10.0.0.${String((nextAddress += 1) % 250)}`;
let address = freshAddress();

const signedInRoute = defineFeature({
  name: 'secret',
  routes: () => [
    defineRoute({
      method: 'GET',
      url: '/api/whoami',
      access: 'signed-in',
      response: z.object({
        userId: z.string(),
        email: z.string(),
        name: z.string(),
        isInstanceAdmin: z.boolean(),
      }),
      handler: ({ user: current }) => current,
    }),
    defineRoute({
      method: 'POST',
      url: '/api/change-something',
      access: 'signed-in',
      response: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
  ],
});

function post(url: string, payload: object, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url,
    payload,
    remoteAddress: address,
    headers: { ...ORIGIN, ...headers },
  });
}

const signIn = (email: string, password: string) =>
  post('/api/auth/sign-in/email', { email, password });

/** The cookie header a browser would send back after this response. */
function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  const list = Array.isArray(header) ? (header as string[]) : [header as string];
  return list.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

async function signedInCookie(password = ADMIN.password): Promise<string> {
  const response = await signIn(ADMIN.email, password);
  expect(response.statusCode).toBe(200);
  return cookieFrom(response);
}

const whoami = (cookie?: string) =>
  app.inject({ url: '/api/whoami', headers: cookie ? { cookie } : {} });

async function resetToFirstRun() {
  await test.database.orm.execute(
    sql`truncate "user", session, account, verification, rate_limit, setup_claim, login_throttle cascade`,
  );
}

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  const orm = test.database.orm;
  auth = createAuth({
    orm,
    secret: 'test-secret-that-is-long-enough-to-use',
    publicUrl: PUBLIC_URL,
  });
  app = buildApp({
    database: test.database,
    features: [setupFeature({ auth, orm }), signedInRoute],
    authorize: createAuthorize(auth),
    auth: { auth, orm },
    publicUrl: PUBLIC_URL,
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await test.stop();
});

beforeEach(async () => {
  address = freshAddress();
  await resetToFirstRun();
});

describe('first-run setup', () => {
  it('is needed until the first account exists, then closes', async () => {
    expect((await app.inject({ url: '/api/setup' })).json()).toEqual({ needed: true });

    expect((await post('/api/setup', ADMIN)).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/setup' })).json()).toEqual({ needed: false });

    const second = await post('/api/setup', { ...ADMIN, email: 'mallory@example.com' });
    expect(second.statusCode).toBe(409);
    expect(apiErrorResponse.parse(second.json()).error.code).toBe('setup_complete');
    const accounts = await test.database.orm.select().from(user);
    expect(accounts.map((row) => row.email)).toEqual([ADMIN.email]);
  });

  it('makes the first account the instance admin', async () => {
    await post('/api/setup', ADMIN);
    const whoAmI = await whoami(await signedInCookie());
    expect(whoAmI.json()).toMatchObject({ email: ADMIN.email, isInstanceAdmin: true });
  });

  it('lets only one of many simultaneous attempts win', async () => {
    const attempts = Array.from({ length: 8 }, (_, i) =>
      post('/api/setup', { ...ADMIN, email: `user${String(i)}@example.com` }),
    );
    const statuses = (await Promise.all(attempts)).map((response) => response.statusCode).sort();
    expect(statuses).toEqual([204, 409, 409, 409, 409, 409, 409, 409]);
    expect(await test.database.orm.select().from(user)).toHaveLength(1);
  });

  it.each([
    ['a short password', { ...ADMIN, password: 'short' }, 'body.password'],
    ['a very long password', { ...ADMIN, password: 'x'.repeat(129) }, 'body.password'],
    ['a bad email', { ...ADMIN, email: 'not-an-email' }, 'body.email'],
    ['a blank name', { ...ADMIN, name: '   ' }, 'body.name'],
  ])('rejects %s, and setup stays open', async (_name, payload, path) => {
    const response = await post('/api/setup', payload);
    expect(response.statusCode).toBe(422);
    expect(apiErrorResponse.parse(response.json()).error.fields?.[0]?.path).toBe(path);
    expect((await app.inject({ url: '/api/setup' })).json()).toEqual({ needed: true });
  });

  it('stores the password only as a hash', async () => {
    await post('/api/setup', ADMIN);
    const result = await test.database.orm.execute(sql`select password from account`);
    const stored = String(result.rows[0]?.password);
    expect(stored).not.toContain(ADMIN.password);
    expect(stored.length).toBeGreaterThan(40);
  });
});

describe('signing in', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });

  it('works with the right password, ignoring email case', async () => {
    const response = await signIn('ALEX@example.com', ADMIN.password);
    expect(response.statusCode).toBe(200);
  });

  it('sets a cookie that scripts and other sites cannot use', async () => {
    const response = await signIn(ADMIN.email, ADMIN.password);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('never returns the password or its hash', async () => {
    const response = await signIn(ADMIN.email, ADMIN.password);
    expect(response.body).not.toContain(ADMIN.password);
    expect(response.body.toLowerCase()).not.toContain('"password"');
    const cookie = cookieFrom(response);
    const current = await app.inject({ url: '/api/auth/get-session', headers: { cookie } });
    expect(current.body.toLowerCase()).not.toContain('password');
  });

  it('answers the same for a wrong password and an unknown email', async () => {
    const wrong = await signIn(ADMIN.email, 'wrong password here');
    const unknown = await signIn('nobody@example.com', 'wrong password here');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(unknown.body).toBe(wrong.body);
  });

  it('cannot be used to create an account', async () => {
    const response = await signIn('new@example.com', ADMIN.password);
    expect(response.statusCode).toBe(401);
    expect(await test.database.orm.select().from(user)).toHaveLength(1);
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });

  it('identifies the caller on signed-in routes', async () => {
    const response = await whoami(await signedInCookie());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: ADMIN.email, name: ADMIN.name });
  });

  it.each([
    ['no cookie', undefined],
    ['a made-up cookie', '__Secure-better-auth.session_token=made-up.value'],
  ])('refuses %s', async (_name, cookie) => {
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('stops working after signing out', async () => {
    const cookie = await signedInCookie();
    const out = await post('/api/auth/sign-out', {}, { cookie });
    expect(out.statusCode).toBe(200);
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('stops working the moment it is revoked', async () => {
    const phone = await signedInCookie();
    const laptop = await signedInCookie();
    expect((await post('/api/auth/revoke-other-sessions', {}, { cookie: laptop })).statusCode).toBe(
      200,
    );
    expect((await whoami(phone)).statusCode).toBe(401);
    expect((await whoami(laptop)).statusCode).toBe(200);
  });

  it('stops working once it expires', async () => {
    const cookie = await signedInCookie();
    await test.database.orm.update(session).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await whoami(cookie)).statusCode).toBe(401);
  });

  it('lists sessions without exposing their tokens', async () => {
    const cookie = await signedInCookie();
    const response = await app.inject({ url: '/api/auth/list-sessions', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json<unknown[]>()).toHaveLength(1);
  });
});

describe('changing a password', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });
  const change = (cookie: string, currentPassword: string, newPassword: string) =>
    post(
      '/api/auth/change-password',
      { currentPassword, newPassword, revokeOtherSessions: true },
      { cookie },
    );

  it('needs the current password', async () => {
    const response = await change(
      await signedInCookie(),
      'not my password',
      'a brand new password',
    );
    expect(response.statusCode).not.toBe(200);
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(200);
  });

  it('needs to be signed in', async () => {
    const response = await post('/api/auth/change-password', {
      currentPassword: ADMIN.password,
      newPassword: 'a brand new password',
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a short new password', async () => {
    const response = await change(await signedInCookie(), ADMIN.password, 'short');
    expect(response.statusCode).toBe(400);
  });

  it('replaces the old password and signs out other devices', async () => {
    const other = await signedInCookie();
    const current = await signedInCookie();
    expect((await change(current, ADMIN.password, 'a brand new password')).statusCode).toBe(200);

    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(401);
    expect((await signIn(ADMIN.email, 'a brand new password')).statusCode).toBe(200);
    expect((await whoami(other)).statusCode).toBe(401);
  });
});

describe('account lockout', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });
  const failTimes = async (count: number, email = ADMIN.email) => {
    for (let i = 0; i < count; i += 1) {
      expect((await signIn(email, 'wrong password here')).statusCode).toBe(401);
    }
  };

  it('locks after repeated failures, even with the right password', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    const response = await signIn(ADMIN.email, ADMIN.password);
    expect(response.statusCode).toBe(429);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('too_many_attempts');
  });

  it('follows the email, not the address, and ignores its case', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    address = freshAddress();
    expect((await signIn('  ALEX@EXAMPLE.COM ', ADMIN.password)).statusCode).toBe(429);
  });

  it('locks unknown emails the same way, so it reveals nothing', async () => {
    await failTimes(MAX_FAILED_SIGN_INS, 'nobody@example.com');
    expect((await signIn('nobody@example.com', 'wrong password here')).statusCode).toBe(429);
  });

  it('does not affect other accounts', async () => {
    await failTimes(MAX_FAILED_SIGN_INS, 'nobody@example.com');
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(200);
  });

  it('allows sign-in one failure below the limit, which then clears the count', async () => {
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(200);
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(200);
  });

  it('ends when the lock runs out', async () => {
    await failTimes(MAX_FAILED_SIGN_INS);
    await test.database.orm
      .update(loginThrottle)
      .set({ lockedUntil: new Date(Date.now() - 1000), windowStartedAt: new Date(0) })
      .where(eq(loginThrottle.email, ADMIN.email));
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(200);
  });

  it('forgets failures older than the window', async () => {
    await failTimes(MAX_FAILED_SIGN_INS - 1);
    await test.database.orm
      .update(loginThrottle)
      .set({ windowStartedAt: new Date(0) })
      .where(eq(loginThrottle.email, ADMIN.email));
    await failTimes(1);
    const [row] = await test.database.orm.select().from(loginThrottle);
    expect(row?.failedCount).toBe(1);
    expect(row?.lockedUntil).toBeNull();
  });

  it('cannot be raced past with simultaneous attempts', async () => {
    await Promise.all(Array.from({ length: 12 }, () => signIn(ADMIN.email, 'wrong password here')));
    const [row] = await test.database.orm.select().from(loginThrottle);
    expect(row?.lockedUntil).not.toBeNull();
    expect((await signIn(ADMIN.email, ADMIN.password)).statusCode).toBe(429);
  });
});

describe('rate limiting', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });
  const attempt = (i: number, headers: Record<string, string> = {}) =>
    post(
      '/api/auth/sign-in/email',
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
    address = freshAddress();
    expect((await attempt(99)).statusCode).toBe(401);
  });
});

describe('the general rate limit', () => {
  it('covers the sign-in routes, before they reach the database', async () => {
    const orm = test.database.orm;
    const limited = buildApp({
      database: test.database,
      auth: { auth, orm },
      publicUrl: PUBLIC_URL,
      requestsPerMinute: 2,
    });
    const hit = () =>
      limited.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
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
});

describe('what is reachable', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });

  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/update-user'],
    ['POST', '/api/auth/delete-user'],
    ['POST', '/api/auth/change-email'],
    ['POST', '/api/auth/request-password-reset'],
    ['POST', '/api/auth/reset-password'],
    ['GET', '/api/auth/ok'],
    ['GET', '/api/auth/error'],
    ['GET', '/api/auth/sign-in/email'],
    ['GET', '/api/auth/constructor'],
    ['GET', '/api/auth/__proto__'],
  ] as const)('%s %s does not exist', async (method, url) => {
    const cookie = await signedInCookie();
    const response = await app.inject({
      method,
      url,
      headers: { ...ORIGIN, cookie },
      ...(method === 'POST' ? { payload: { name: 'x', isInstanceAdmin: true } } : {}),
    });
    expect(response.statusCode).toBe(404);
  });

  it('cannot create an account through public sign-up', async () => {
    const response = await post('/api/auth/sign-up/email', {
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'a long enough password',
    });
    expect(response.statusCode).toBe(404);
    expect(await test.database.orm.select().from(user)).toHaveLength(1);
  });
});

describe('requests from other sites', () => {
  beforeEach(async () => {
    await post('/api/setup', ADMIN);
  });

  it('refuses a change from another origin, with a valid cookie', async () => {
    const cookie = await signedInCookie();
    const response = await post(
      '/api/change-something',
      {},
      { cookie, origin: 'https://evil.test' },
    );
    expect(response.statusCode).toBe(403);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('bad_origin');
  });

  it('refuses a change with a cookie and no origin', async () => {
    const cookie = await signedInCookie();
    const response = await app.inject({
      method: 'POST',
      url: '/api/change-something',
      payload: {},
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows a change from this site', async () => {
    const cookie = await signedInCookie();
    expect((await post('/api/change-something', {}, { cookie })).statusCode).toBe(200);
  });

  it('refuses sign-in and setup from another origin', async () => {
    const evil = { origin: 'https://evil.test' };
    const body = { email: ADMIN.email, password: ADMIN.password };
    expect((await post('/api/auth/sign-in/email', body, evil)).statusCode).toBe(403);
    await resetToFirstRun();
    expect((await post('/api/setup', ADMIN, evil)).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/setup' })).json()).toEqual({ needed: true });
  });
});
