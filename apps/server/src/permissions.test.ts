import { describe, expect, it } from 'vitest';
import { buildApp } from './core/app.ts';
import type { Auth } from './core/auth/index.ts';
import { setupFeature } from './core/auth/setup.ts';
import { features } from './features/index.ts';
import type { Orm } from '@remidy/db';

// Walks the real app, so every route added by every feature is covered automatically.
describe('every route in the app', () => {
  // A new public route fails this test until it's added here, so it's always a deliberate choice.
  const PUBLIC_ROUTES = [
    'GET /api/features',
    'GET /api/health',
    'GET /api/setup',
    'POST /api/auth/*',
    'POST /api/setup',
  ];

  // Stand-ins, because this only inspects routes. Nothing here reaches a real database.
  const auth = {} as Auth;
  const orm = {} as Orm;
  const app = buildApp({
    database: { ping: () => Promise.resolve(true) },
    features: [setupFeature({ auth, orm }), ...features],
    auth: { auth, orm },
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
