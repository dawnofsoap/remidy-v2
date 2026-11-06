import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../app.ts';
import { defineFeature, defineRoute } from '../feature.ts';
import { createAuth, createAuthorize, type Auth } from './index.ts';
import type { Mail } from '../mail.ts';
import { signInOptionsFeature } from './sign-in-options.ts';

export const PUBLIC_URL = 'https://remidy.test';
export const ORIGIN = { origin: PUBLIC_URL };
export const PERSON = {
  name: 'Alex',
  email: 'alex@example.com',
  password: 'correct horse battery',
};

let nextAddress = 1;

/** A new address, so that one test's attempts don't use up another's rate limit. */
export const freshAddress = () => `10.0.0.${String((nextAddress += 1) % 250)}`;

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

/** The cookie header a browser would send back after this response. */
export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  const list = Array.isArray(header) ? (header as string[]) : [header as string];
  return list.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

/** A real app on a real database, emptied before each test. Call once, at the top of a test file. */
export function useAuthHarness() {
  const state = {
    test: undefined as unknown as TestDatabase,
    auth: undefined as unknown as Auth,
    app: undefined as unknown as FastifyInstance,
    address: freshAddress(),
    /** Messages sent so far. */
    mail: [] as Mail[],
    /** Set this to make sending fail. */
    mailFailure: null as Error | null,
    mailFailures: [] as unknown[],
  };

  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    state.app.inject({
      method: 'POST',
      url,
      payload,
      remoteAddress: state.address,
      headers: { ...ORIGIN, ...headers },
    });

  const signIn = (email: string, password: string) =>
    post('/api/auth/sign-in/email', { email, password });

  const signedInCookie = async (password = PERSON.password): Promise<string> => {
    const response = await signIn(PERSON.email, password);
    expect(response.statusCode).toBe(200);
    return cookieFrom(response);
  };

  const whoami = (cookie?: string) =>
    state.app.inject({ url: '/api/whoami', headers: cookie ? { cookie } : {} });

  /** An ordinary account, added directly, because invitations don't exist yet. */
  const createAccount = async () => {
    const context = await state.auth.$context;
    const created = await context.internalAdapter.createUser(
      { name: PERSON.name, email: PERSON.email },
      { method: 'email' },
    );
    await context.internalAdapter.linkAccount({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      password: await context.password.hash(PERSON.password),
    });
  };

  beforeAll(async () => {
    state.test = await startTestDatabase();
    await state.test.database.migrate();
    const orm = state.test.database.orm;
    state.auth = createAuth({
      orm,
      secret: 'test-secret-that-is-long-enough-to-use',
      publicUrl: PUBLIC_URL,
      mailer: {
        send: (mail) => {
          if (state.mailFailure) return Promise.reject(state.mailFailure);
          state.mail.push(mail);
          return Promise.resolve();
        },
      },
      onMailFailure: (error) => {
        state.mailFailures.push(error);
      },
    });
    state.app = buildApp({
      database: state.test.database,
      features: [signInOptionsFeature({ orm, passwordReset: true }), signedInRoute],
      authorize: createAuthorize(state.auth, orm),
      auth: { auth: state.auth, orm, passwordReset: true },
      publicUrl: PUBLIC_URL,
    });
    await state.app.ready();
  }, 180_000);

  afterAll(async () => {
    await state.app.close();
    await state.test.stop();
  });

  beforeEach(async () => {
    state.address = freshAddress();
    state.mail.length = 0;
    state.mailFailures.length = 0;
    await state.test.database.orm.execute(
      sql`truncate "user", session, account, verification, rate_limit, login_throttle, space, membership cascade`,
    );
  });

  return Object.assign(state, { post, signIn, signedInCookie, whoami, createAccount });
}
