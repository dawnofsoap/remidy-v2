import { membership, space, type Orm } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './core/app.ts';
import { createAuth, createAuthorize, type Auth } from './core/auth/index.ts';
import { signInOptionsFeature } from './core/auth/sign-in-options.ts';
import type { Route, SpaceRole } from './core/feature.ts';
import { heartbeatJob, jobStatusFeature } from './core/jobs.ts';
import { roleAtLeast } from './core/spaces.ts';
import { features } from './features/index.ts';

const PUBLIC_URL = 'https://remidy.test';
const PASSWORD = 'a perfectly long test password';

// A new public route fails this test until it's added here, so it's always a deliberate choice.
const PUBLIC_ROUTES = [
  'GET /api/health',
  'GET /api/v1/features',
  'GET /api/v1/sign-in-options',
  'POST /api/v1/auth/*',
];

let test: TestDatabase;
let orm: Orm;
let auth: Auth;
let app: FastifyInstance;

interface Person {
  userId: string;
  cookie: string;
  personalSpaceId: string;
}
const people = {} as Record<'admin' | 'owner' | 'manager' | 'member' | 'stranger', Person>;
let sharedSpaceId: string;
let nextAddress = 1;

async function createPerson(name: string): Promise<Person> {
  const context = await auth.$context;
  const email = `${name}@example.com`;
  const created = await context.internalAdapter.createUser(
    { name, email, isInstanceAdmin: name === 'admin' },
    { method: 'email' },
  );
  await context.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await context.password.hash(PASSWORD),
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in/email',
    remoteAddress: `10.1.0.${String((nextAddress += 1))}`,
    headers: { origin: PUBLIC_URL },
    payload: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const header = response.headers['set-cookie'];
  const cookie = (Array.isArray(header) ? header : [String(header)])
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  const [personal] = await orm
    .select({ id: membership.spaceId })
    .from(membership)
    .where(eq(membership.userId, created.id));
  return { userId: created.id, cookie, personalSpaceId: personal?.id ?? '' };
}

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  orm = test.database.orm;
  auth = createAuth({
    orm,
    secret: 'test-secret-that-is-long-enough-to-use',
    publicUrl: PUBLIC_URL,
  });
  app = buildApp({
    database: test.database,
    features: [
      signInOptionsFeature({ orm, passwordReset: true }),
      jobStatusFeature({ orm, jobs: [heartbeatJob] }),
      ...features,
    ],
    authorize: createAuthorize(auth, orm),
    auth: { auth, orm },
    publicUrl: PUBLIC_URL,
  });
  await app.ready();

  for (const name of ['admin', 'owner', 'manager', 'member', 'stranger'] as const) {
    people[name] = await createPerson(name);
  }

  const [shared] = await orm
    .insert(space)
    .values({ name: 'Household', kind: 'shared' })
    .returning({ id: space.id });
  sharedSpaceId = shared?.id ?? '';
  await orm.insert(membership).values(
    (['owner', 'manager', 'member'] as const).map((role) => ({
      userId: people[role].userId,
      spaceId: sharedSpaceId,
      role,
    })),
  );
}, 180_000);

afterAll(async () => {
  await app.close();
  await test.stop();
});

const key = (route: { method: string; url: string }) => `${route.method} ${route.url}`;
const routes = () => app.declaredRoutes;

function spaceRoutes(): (Route & { access: { space: SpaceRole } })[] {
  return routes().filter(
    (route): route is Route & { access: { space: SpaceRole } } => typeof route.access === 'object',
  );
}

/** Fills in a route's URL. Any other parameter gets a value that doesn't exist. */
const urlFor = (route: Route, spaceId: string) =>
  route.url.replace(':spaceId', spaceId).replace(/:[a-zA-Z]+/g, randomUUID());

function call(route: Route, url: string, cookie?: string) {
  return app.inject({
    method: route.method,
    url,
    headers: { origin: PUBLIC_URL, ...(cookie ? { cookie } : {}) },
    ...(route.method === 'GET' ? {} : { payload: {} }),
  });
}

const errorCode = (response: { json: () => unknown }) =>
  (response.json() as { error: { code: string } }).error.code;

// These walk the real app, so every route added by any feature is covered automatically.
describe('every route in the app', () => {
  it('is under the API version, apart from the health check', () => {
    const unversioned = routes()
      .filter((route) => !route.url.startsWith('/api/v1/'))
      .map(key);
    expect(unversioned).toEqual(['GET /api/health']);
  });

  it.each([
    ['GET', '/api/spaces'],
    ['GET', '/api/features'],
    ['GET', '/api/sign-in-options'],
    ['GET', '/api/admin/jobs'],
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/sign-in/email'],
    ['GET', '/api/v1/health'],
    ['GET', '/api/v2/spaces'],
  ] as const)('has nothing at %s %s', async (method, url) => {
    const response = await app.inject({
      method,
      url,
      headers: { origin: PUBLIC_URL },
      ...(method === 'POST' ? { payload: {} } : {}),
    });
    expect(response.statusCode).toBe(404);
  });

  it('lets only instance admins reach instance-admin routes', async () => {
    const adminRoutes = routes().filter((route) => route.access === 'instance-admin');
    expect(adminRoutes.map(key)).toContain('GET /api/v1/admin/jobs');
    for (const route of adminRoutes) {
      const url = urlFor(route, people.owner.personalSpaceId);
      expect((await call(route, url)).statusCode, key(route)).toBe(401);
      for (const name of ['owner', 'manager', 'member', 'stranger'] as const) {
        const refused = await call(route, url, people[name].cookie);
        expect(refused.statusCode, `${key(route)} as ${name}`).toBe(403);
      }
      expect((await call(route, url, people.admin.cookie)).statusCode, key(route)).toBeLessThan(
        500,
      );
      expect((await call(route, url, people.admin.cookie)).statusCode, key(route)).not.toBe(403);
    }
  });

  it('has only the known public routes', () => {
    const open = routes()
      .filter((route) => route.access === 'public')
      .map(key);
    expect(open.sort()).toEqual(PUBLIC_ROUTES);
  });

  it('has routes to check, so these tests can’t pass by checking nothing', () => {
    expect(routes().filter((route) => route.access !== 'public').length).toBeGreaterThan(2);
    expect(spaceRoutes().length).toBeGreaterThan(2);
  });

  it('refuses every non-public route without sign-in', async () => {
    for (const route of routes().filter((candidate) => candidate.access !== 'public')) {
      const response = await call(route, urlFor(route, sharedSpaceId));
      expect(response.statusCode, key(route)).toBe(401);
    }
  });

  it('refuses a made-up session on every non-public route', async () => {
    const fake = '__Secure-better-auth.session_token=made-up.value';
    for (const route of routes().filter((candidate) => candidate.access !== 'public')) {
      const response = await call(route, urlFor(route, sharedSpaceId), fake);
      expect(response.statusCode, key(route)).toBe(401);
    }
  });

  it('answers not found to non-members on every space route', async () => {
    for (const route of spaceRoutes()) {
      const response = await call(route, urlFor(route, sharedSpaceId), people.stranger.cookie);
      expect(response.statusCode, key(route)).toBe(404);
    }
  });

  it('gives the same answer for someone else’s space and one that doesn’t exist', async () => {
    for (const route of spaceRoutes()) {
      const theirs = await call(route, urlFor(route, sharedSpaceId), people.stranger.cookie);
      const missing = await call(route, urlFor(route, randomUUID()), people.stranger.cookie);
      expect(missing.statusCode, key(route)).toBe(theirs.statusCode);
      expect(errorCode(missing), key(route)).toBe(errorCode(theirs));
    }
  });

  it('keeps people out of each other’s personal spaces', async () => {
    for (const route of spaceRoutes()) {
      const url = urlFor(route, people.owner.personalSpaceId);
      const response = await call(route, url, people.member.cookie);
      expect(response.statusCode, key(route)).toBe(404);
    }
  });

  it('does not let the instance admin into anyone’s space', async () => {
    for (const route of spaceRoutes()) {
      const response = await call(route, urlFor(route, sharedSpaceId), people.admin.cookie);
      expect(response.statusCode, key(route)).toBe(404);
    }
  });

  it('refuses each role below what a route needs, and allows the rest', async () => {
    for (const route of spaceRoutes()) {
      for (const role of ['member', 'manager', 'owner'] as const) {
        const response = await call(route, urlFor(route, sharedSpaceId), people[role].cookie);
        if (roleAtLeast(role, route.access.space)) {
          // Past the access check. A later 404 can only be for the made-up IDs filled in above.
          expect([401, 403], `${key(route)} as ${role}`).not.toContain(response.statusCode);
        } else {
          expect(response.statusCode, `${key(route)} as ${role}`).toBe(403);
        }
      }
    }
  });

  it('never breaks on a malformed space ID', async () => {
    for (const route of spaceRoutes()) {
      for (const bad of ['not-a-uuid', "1'; drop table space; --", '00000000']) {
        const url = urlFor(route, encodeURIComponent(bad));
        const response = await call(route, url, people.owner.cookie);
        expect(response.statusCode, `${key(route)} ${bad}`).toBe(404);
      }
    }
  });
});

describe('roles', () => {
  it('rank member, then manager, then owner', () => {
    expect(roleAtLeast('member', 'member')).toBe(true);
    expect(roleAtLeast('member', 'manager')).toBe(false);
    expect(roleAtLeast('manager', 'manager')).toBe(true);
    expect(roleAtLeast('manager', 'owner')).toBe(false);
    expect(roleAtLeast('owner', 'manager')).toBe(true);
    expect(roleAtLeast('owner', 'owner')).toBe(true);
  });

  it('cannot be claimed by the client', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/spaces/${sharedSpaceId}`,
      headers: { origin: PUBLIC_URL, cookie: people.manager.cookie },
      payload: { role: 'owner', kind: 'personal', name: 'Household' },
    });
    const [row] = await orm.select().from(space).where(eq(space.id, sharedSpaceId));
    expect(row?.kind).toBe('shared');
    const roles = await orm.select().from(membership).where(eq(membership.spaceId, sharedSpaceId));
    expect(roles.find((item) => item.userId === people.manager.userId)?.role).toBe('manager');
  });
});

describe('personal spaces', () => {
  it('are created with each account, owned by that person alone', async () => {
    const rows = await orm
      .select()
      .from(membership)
      .where(eq(membership.spaceId, people.stranger.personalSpaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: people.stranger.userId, role: 'owner' });
  });

  it('list only the caller’s own spaces', async () => {
    const response = await app.inject({
      url: '/api/v1/spaces',
      headers: { cookie: people.stranger.cookie },
    });
    expect(response.json<{ id: string }[]>().map((item) => item.id)).toEqual([
      people.stranger.personalSpaceId,
    ]);
  });

  it('show each person only the members of their own space', async () => {
    const response = await app.inject({
      url: `/api/v1/spaces/${people.stranger.personalSpaceId}/members`,
      headers: { cookie: people.stranger.cookie },
    });
    expect(response.json<{ userId: string }[]>().map((item) => item.userId)).toEqual([
      people.stranger.userId,
    ]);
  });
});

describe('updating a space', () => {
  const patch = (cookie: string, payload: object) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/spaces/${people.owner.personalSpaceId}`,
      headers: { origin: PUBLIC_URL, cookie },
      payload,
    });

  it('saves a real time zone', async () => {
    const response = await patch(people.owner.cookie, { timeZone: 'Asia/Tokyo' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ timeZone: 'Asia/Tokyo', role: 'owner' });
  });

  it('refuses a made-up time zone', async () => {
    const response = await patch(people.owner.cookie, { timeZone: 'Mars/Olympus' });
    expect(response.statusCode).toBe(422);
  });

  it('refuses a blank name', async () => {
    expect((await patch(people.owner.cookie, { name: '   ' })).statusCode).toBe(422);
  });
});
