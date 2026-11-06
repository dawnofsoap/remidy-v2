import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './core/app.ts';
import type { Auth } from './core/auth/index.ts';
import { signInOptionsFeature } from './core/auth/sign-in-options.ts';
import { features } from './features/index.ts';
import type { Orm } from '@remidy/db';

// Walks the real app, so every route added by every feature is covered automatically.
describe('every route in the app', () => {
  // A new public route fails this test until it's added here, so it's always a deliberate choice.
  const PUBLIC_ROUTES = [
    'GET /api/features',
    'GET /api/health',
    'GET /api/sign-in-options',
    'POST /api/auth/*',
  ];

  // Stand-ins, because this only inspects routes. Nothing here reaches a real database.
  const auth = {} as Auth;
  const orm = {} as Orm;
  const app = buildApp({
    database: { ping: () => Promise.resolve(true) },
    features: [signInOptionsFeature({ orm }), ...features],
    auth: { auth, orm },
  });
  beforeAll(async () => {
    await app.ready();
  });

  const key = (route: { method: string; url: string }) => `${route.method} ${route.url}`;

  it('has only the known public routes', () => {
    const open = app.declaredRoutes.filter((route) => route.access === 'public').map(key);
    expect(open.sort()).toEqual(PUBLIC_ROUTES);
  });

  it('refuses every other route without sign-in', async () => {
    const protectedRoutes = app.declaredRoutes.filter((route) => route.access !== 'public');
    for (const route of protectedRoutes) {
      const response = await app.inject({ method: route.method, url: route.url });
      expect(response.statusCode, key(route)).toBe(401);
    }
  });
});
