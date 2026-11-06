import { apiErrorResponse } from '@remidy/contracts';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.ts';
import { AppError } from './errors.ts';
import { defineFeature, defineRoute, type Authorize, type Feature } from './feature.ts';

const database = { ping: () => Promise.resolve(true) };

function appWith(routes: ReturnType<typeof defineRoute>[], authorize?: Authorize) {
  return buildApp({
    database,
    features: [defineFeature({ name: 'test', routes: () => routes })],
    ...(authorize ? { authorize } : {}),
  });
}

const ok = z.object({ ok: z.boolean() });
const authorized = {
  user: { userId: 'u1', email: 'a@example.com', name: 'A', isInstanceAdmin: false },
  space: null,
};

describe('adding a route', () => {
  it('refuses to start with a route added any other way', () => {
    const app = buildApp({ database });
    expect(() => app.get('/api/sneaky', () => ({ ok: true }))).toThrow(/defineRoute/);
  });

  it('refuses duplicate feature names', () => {
    const twin: Feature = defineFeature({ name: 'twin', routes: () => [] });
    expect(() => buildApp({ database, features: [twin, twin] })).toThrow(/twin/);
  });
});

describe('space routes', () => {
  it('cannot be defined without a space in the URL', () => {
    expect(() =>
      defineRoute({
        method: 'GET',
        url: '/api/bills',
        access: { space: 'member' },
        response: ok,
        handler: () => ({ ok: true }),
      }),
    ).toThrow(/:spaceId/);
  });

  it('give the handler the checked space', async () => {
    const route = defineRoute({
      method: 'GET',
      url: '/api/spaces/:spaceId/thing',
      access: { space: 'manager' },
      response: z.object({ id: z.string(), role: z.string() }),
      handler: ({ space }) => ({ id: space.id, role: space.role }),
    });
    const authorize = vi.fn<Authorize>(() =>
      Promise.resolve({ ...authorized, space: { id: 's1', role: 'owner' } }),
    );
    const response = await appWith([route], authorize).inject({ url: '/api/spaces/s1/thing' });
    expect(response.json()).toEqual({ id: 's1', role: 'owner' });
    expect(authorize).toHaveBeenCalledWith({ space: 'manager' }, expect.anything());
  });
});

describe('access', () => {
  const secret = (handler = vi.fn(() => ({ ok: true }))) =>
    defineRoute({
      method: 'POST',
      url: '/api/secret',
      access: 'signed-in',
      body: z.object({ amount: z.number() }),
      response: ok,
      handler,
    });

  it('denies everything that is not public by default', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const response = await appWith([secret(handler)]).inject({
      method: 'POST',
      url: '/api/secret',
      payload: { amount: 1 },
    });
    expect(response.statusCode).toBe(401);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('not_signed_in');
    expect(handler).not.toHaveBeenCalled();
  });

  it('checks access before validating, so validation errors reveal nothing', async () => {
    const response = await appWith([secret()]).inject({
      method: 'POST',
      url: '/api/secret',
      payload: { amount: 'not a number' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('runs the handler when access is granted', async () => {
    const authorize = vi.fn<Authorize>(() => Promise.resolve(authorized));
    const response = await appWith([secret()], authorize).inject({
      method: 'POST',
      url: '/api/secret',
      payload: { amount: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(authorize).toHaveBeenCalledWith('signed-in', expect.anything());
  });

  it('passes on a refusal from the access check', async () => {
    const authorize: Authorize = () =>
      Promise.reject(new AppError(403, 'forbidden', 'You can’t do that.'));
    const response = await appWith([secret()], authorize).inject({
      method: 'POST',
      url: '/api/secret',
      payload: { amount: 1 },
    });
    expect(response.statusCode).toBe(403);
  });

  it('never asks about public routes', async () => {
    const authorize = vi.fn<Authorize>(() => Promise.resolve(authorized));
    await appWith([], authorize).inject({ url: '/api/health' });
    expect(authorize).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  const route = defineRoute({
    method: 'POST',
    url: '/api/items/:id',
    access: 'public',
    params: z.object({ id: z.coerce.number().int() }),
    query: z.object({ limit: z.coerce.number().max(10).default(5) }),
    body: z.object({ name: z.string().min(1), extra: z.never().optional() }),
    response: z.object({ id: z.number(), limit: z.number(), name: z.string() }),
    handler: ({ params, query, body }) => ({ id: params.id, limit: query.limit, name: body.name }),
  });

  it('gives the handler parsed and typed input', async () => {
    const response = await appWith([route]).inject({
      method: 'POST',
      url: '/api/items/7?limit=3',
      payload: { name: 'Water' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 7, limit: 3, name: 'Water' });
  });

  it.each([
    ['params', '/api/items/abc', { name: 'Water' }, 'params.id'],
    ['query', '/api/items/7?limit=99', { name: 'Water' }, 'query.limit'],
    ['body', '/api/items/7', { name: '' }, 'body.name'],
    ['a missing body', '/api/items/7', {}, 'body.name'],
  ])('rejects bad %s and names the field', async (_name, url, payload, path) => {
    const response = await appWith([route]).inject({ method: 'POST', url, payload });
    expect(response.statusCode).toBe(422);
    const { error } = apiErrorResponse.parse(response.json());
    expect(error.code).toBe('validation_failed');
    expect(error.fields?.map((field) => field.path)).toContain(path);
  });

  it('does not repeat rejected input', async () => {
    const response = await appWith([route]).inject({
      method: 'POST',
      url: '/api/items/7',
      payload: { name: 12345678 },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain('12345678');
  });
});

describe('responses', () => {
  it('removes fields the schema does not list', async () => {
    const route = defineRoute({
      method: 'GET',
      url: '/api/user',
      access: 'public',
      response: z.object({ email: z.string() }),
      handler: () => ({ email: 'a@example.com', passwordHash: 'should-not-leak' }),
    });
    const response = await appWith([route]).inject({ url: '/api/user' });
    expect(response.body).not.toContain('should-not-leak');
    expect(response.json()).toEqual({ email: 'a@example.com' });
  });

  it('treats a response that breaks its schema as a server error, and hides it', async () => {
    const route = defineRoute({
      method: 'GET',
      url: '/api/bad',
      access: 'public',
      response: z.object({ count: z.number() }),
      handler: () => ({ count: 'private-value' }) as unknown as { count: number },
    });
    const response = await appWith([route]).inject({ url: '/api/bad' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('private-value');
  });

  it('uses the declared status, and sends nothing for 204', async () => {
    const created = defineRoute({
      method: 'POST',
      url: '/api/made',
      access: 'public',
      status: 201,
      response: ok,
      handler: () => ({ ok: true }),
    });
    const removed = defineRoute({
      method: 'DELETE',
      url: '/api/made',
      access: 'public',
      status: 204,
      response: z.undefined(),
      handler: () => undefined,
    });
    const app = appWith([created, removed]);
    expect((await app.inject({ method: 'POST', url: '/api/made' })).statusCode).toBe(201);
    const response = await app.inject({ method: 'DELETE', url: '/api/made' });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });
});

describe('the general rate limit', () => {
  const limited = (requestsPerMinute: number) =>
    buildApp({
      database,
      requestsPerMinute,
      features: [
        defineFeature({
          name: 'test',
          routes: () => [
            defineRoute({
              method: 'GET',
              url: '/api/thing',
              access: 'public',
              response: ok,
              handler: () => ({ ok: true }),
            }),
          ],
        }),
      ],
    });
  const hit = (
    app: ReturnType<typeof limited>,
    headers: Record<string, string> = {},
    ip = '10.0.0.5',
  ) => app.inject({ url: '/api/thing', remoteAddress: ip, headers });

  it('refuses requests over the limit, in the standard error format', async () => {
    const app = limited(2);
    expect((await hit(app)).statusCode).toBe(200);
    expect((await hit(app)).statusCode).toBe(200);
    const refused = await hit(app);
    expect(refused.statusCode).toBe(429);
    expect(apiErrorResponse.parse(refused.json()).error.code).toBe('too_many_requests');
    expect(refused.headers['retry-after']).toBeDefined();
  });

  it('counts each address separately', async () => {
    const app = limited(1);
    await hit(app);
    expect((await hit(app)).statusCode).toBe(429);
    expect((await hit(app, {}, '10.0.0.6')).statusCode).toBe(200);
  });

  it('cannot be dodged by forging a forwarding header', async () => {
    const app = limited(1);
    await hit(app, { 'x-forwarded-for': '203.0.113.1' });
    expect((await hit(app, { 'x-forwarded-for': '203.0.113.2' })).statusCode).toBe(429);
  });

  it('never limits the health check', async () => {
    const app = limited(1);
    for (let i = 0; i < 3; i += 1) {
      const response = await app.inject({ url: '/api/health', remoteAddress: '10.0.0.5' });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe('client addresses', () => {
  const ipRoute = defineRoute({
    method: 'GET',
    url: '/api/ip',
    access: 'public',
    response: z.object({ ip: z.string() }),
    handler: ({ request }) => ({ ip: request.ip }),
  });
  const ipFrom = async (trustProxy: string, remoteAddress: string) => {
    const app = buildApp({
      database,
      trustProxy,
      features: [defineFeature({ name: 'test', routes: () => [ipRoute] })],
    });
    const response = await app.inject({
      url: '/api/ip',
      remoteAddress,
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.9' },
    });
    return response.json<{ ip: string }>().ip;
  };

  it('ignores forwarding headers by default, since anyone can send them', async () => {
    expect(await ipFrom('', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('reads the client from a trusted proxy', async () => {
    expect(await ipFrom('10.0.0.1', '10.0.0.1')).toBe('198.51.100.9');
    expect(await ipFrom('10.0.0.0/8', '10.0.0.1')).toBe('198.51.100.9');
  });

  it('does not believe the entry a client added before reaching the proxy', async () => {
    expect(await ipFrom('10.0.0.1', '10.0.0.1')).not.toBe('203.0.113.7');
  });

  it('ignores forwarding headers from anyone who is not the proxy', async () => {
    expect(await ipFrom('10.0.0.1', '10.9.9.9')).toBe('10.9.9.9');
  });

  it('refuses to start with a setting it cannot read', () => {
    expect(() => buildApp({ database, trustProxy: 'not-an-address' })).toThrow();
  });
});

describe('feature flags', () => {
  const flagged = defineFeature({
    name: 'beta',
    flagged: true,
    routes: () => [
      defineRoute({
        method: 'GET',
        url: '/api/beta',
        access: 'public',
        response: ok,
        handler: () => ({ ok: true }),
      }),
    ],
  });

  it('keeps a flagged feature off by default', async () => {
    const app = buildApp({ database, features: [flagged] });
    expect((await app.inject({ url: '/api/beta' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/features' })).json()).toEqual({ enabled: [] });
  });

  it('turns it on when enabled, and reports that', async () => {
    const app = buildApp({ database, features: [flagged], enabledFeatures: ['beta'] });
    expect((await app.inject({ url: '/api/beta' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/features' })).json()).toEqual({ enabled: ['beta'] });
  });

  it('refuses to start when the setting names an unknown feature', () => {
    expect(() => buildApp({ database, enabledFeatures: ['typo'] })).toThrow(/typo/);
  });
});
