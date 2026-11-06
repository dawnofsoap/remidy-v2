import { healthResponse } from '@remidy/contracts';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = buildApp({ database: { ping: () => Promise.resolve(true) } });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(healthResponse.parse(response.json())).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded with a 503 when the database is down', async () => {
    const app = buildApp({ database: { ping: () => Promise.resolve(false) } });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(healthResponse.parse(response.json())).toEqual({ status: 'degraded', database: 'down' });
  });
});
