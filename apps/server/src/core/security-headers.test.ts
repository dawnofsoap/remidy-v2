import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

const database = { ping: () => Promise.resolve(true) };
const secure = buildApp({ database, publicUrl: 'https://remidy.example.com' });
const plain = buildApp({ database, publicUrl: 'http://localhost:5173' });

afterAll(async () => {
  await Promise.all([secure.close(), plain.close()]);
});

const directive = (policy: unknown, name: string) =>
  String(policy)
    .split('; ')
    .find((part) => part.startsWith(`${name} `));

describe('security headers', () => {
  it.each([
    ['a normal response', '/api/health', 200],
    ['a missing address', '/nothing', 404],
  ])('are on %s', async (_name, url, statusCode) => {
    const response = await secure.inject({ url });
    expect(response.statusCode).toBe(statusCode);
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000',
    });
    expect(response.headers['permissions-policy']).toContain('camera=()');
  });

  it('are on a refused request from another site', async () => {
    const response = await secure.inject({
      method: 'POST',
      url: '/api/health',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('allow scripts only from our own files', async () => {
    const { headers } = await secure.inject({ url: '/api/health' });
    const policy = headers['content-security-policy'];
    expect(directive(policy, 'script-src')).toBe("script-src 'self'");
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(String(policy)).toContain('upgrade-insecure-requests');
  });

  it('don’t ask browsers for https when the app isn’t on it', async () => {
    const { headers } = await plain.inject({ url: '/api/health' });
    expect(headers['strict-transport-security']).toBeUndefined();
    expect(String(headers['content-security-policy'])).not.toContain('upgrade-insecure-requests');
  });

  it('keep API responses out of browser caches', async () => {
    const { headers } = await secure.inject({ url: '/api/health' });
    expect(headers['cache-control']).toBe('no-store');
  });
});
