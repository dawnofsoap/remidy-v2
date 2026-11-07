import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

const parent = mkdtempSync(join(tmpdir(), 'remidy-web-'));
const site = join(parent, 'site');
mkdirSync(join(site, 'assets'), { recursive: true });
// Beside the site, to prove a request can't climb out of it.
writeFileSync(join(parent, 'outside.txt'), 'private');
writeFileSync(join(site, 'index.html'), '<div id="root"></div>');
writeFileSync(join(site, 'favicon.svg'), '<svg></svg>');
writeFileSync(join(site, 'assets', 'app-abc123.js'), 'run();');

const database = { ping: () => Promise.resolve(true) };
const app = buildApp({ database, webRoot: site, publicUrl: 'https://remidy.example.com' });

afterAll(async () => {
  await app.close();
  rmSync(parent, { recursive: true });
});

const get = (url: string) => app.inject({ method: 'GET', url });

describe('serving the web app', () => {
  it.each(['/', '/settings', '/spaces/1/activity?page=2', '/reset-password'])(
    'answers the page %s with the app',
    async (url) => {
      const response = await get(url);
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('id="root"');
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
    },
  );

  it('keeps named assets forever, with the right type', async () => {
    const response = await get('/assets/app-abc123.js?v=1');
    expect(response.body).toBe('run();');
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('checks other files each time', async () => {
    const response = await get('/favicon.svg');
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('answers HEAD too', async () => {
    const response = await app.inject({ method: 'HEAD', url: '/settings' });
    expect(response.statusCode).toBe(200);
  });

  it.each(['/assets/missing.js', '/missing.png', '/gallery.html'])(
    'says a missing file %s is missing, rather than sending the app',
    async (url) => {
      const response = await get(url);
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('id="root"');
    },
  );

  it.each(['/api/v1/nothing', '/api/nothing', '/api/'])(
    'keeps unknown API addresses such as %s as API errors',
    async (url) => {
      const response = await get(url);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
    },
  );

  it.each([
    '/../outside.txt',
    '/..%2foutside.txt',
    '/assets/../../outside.txt',
    '/%2e%2e/outside.txt',
  ])('never reaches outside the site with %s', async (url) => {
    const response = await get(url);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('private');
  });

  it('still answers real API routes', async () => {
    const response = await get('/api/health');
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('doesn’t take other methods', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/settings',
      headers: { origin: 'https://remidy.example.com' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses to start without a built app', () => {
    expect(() => buildApp({ database, webRoot: join(site, 'assets') })).toThrow(
      'has no index.html',
    );
  });
});
