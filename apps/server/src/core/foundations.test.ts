import { apiErrorResponse } from '@remidy/contracts';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { AppError } from './errors.ts';
import { defineFeature, defineRoute } from './feature.ts';
import { loggerOptions, requestId } from './logging.ts';

const database = { ping: () => Promise.resolve(true) };

/** A test feature with a route that succeeds, one that throws, and one that accepts a body. */
function testFeature(error: unknown = new Error('real cause for the logs')) {
  const response = z.object({ ok: z.boolean() });
  return defineFeature({
    name: 'test',
    routes: () => [
      defineRoute({
        method: 'GET',
        url: '/api/thing',
        access: 'public',
        response,
        handler: () => ({ ok: true }),
      }),
      defineRoute({
        method: 'GET',
        url: '/api/boom',
        access: 'public',
        response,
        handler: () => {
          throw error;
        },
      }),
      // Only needs to parse the body. It must never send input back.
      defineRoute({
        method: 'POST',
        url: '/api/echo',
        access: 'public',
        response,
        handler: () => ({ ok: true }),
      }),
    ],
  });
}
const STRONG_URL = 'postgresql://remidy:Xk29fj3LmQ81vbZa@db:5432/remidy';

function failure(env: Record<string, string>): string {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.message;
    throw error;
  }
  throw new Error('Expected loadConfig to fail');
}

describe('loadConfig', () => {
  it('accepts a complete production configuration', () => {
    expect(loadConfig({ DATABASE_URL: STRONG_URL, PORT: '8080' })).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'info',
      ENABLED_FEATURES: [],
      DATABASE_URL: STRONG_URL,
    });
  });

  it('treats an unset environment as production', () => {
    expect(loadConfig({ DATABASE_URL: STRONG_URL }).NODE_ENV).toBe('production');
  });

  it('requires a database', () => {
    expect(failure({})).toContain('DATABASE_URL is required');
  });

  it.each(['remidy_dev_only', 'replace-me', 'changeme', 'PASSWORD', 'postgres', 'remidy'])(
    'refuses the password %s in production',
    (password) => {
      const message = failure({ DATABASE_URL: `postgresql://remidy:${password}@db/remidy` });
      expect(message).toContain('DATABASE_URL needs a strong, unique password');
    },
  );

  it('refuses a missing password in production', () => {
    expect(failure({ DATABASE_URL: 'postgresql://remidy@db/remidy' })).toContain('strong, unique');
  });

  it('allows the development password in development', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://remidy:remidy_dev_only@db/remidy',
    };
    expect(loadConfig(env).NODE_ENV).toBe('development');
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '0'],
    ['LOG_LEVEL', 'loud'],
    ['NODE_ENV', 'staging'],
  ])('rejects %s=%s', (name, value) => {
    expect(failure({ DATABASE_URL: STRONG_URL, [name]: value })).toContain(name);
  });

  it('reports every problem at once', () => {
    const message = failure({ PORT: 'abc', LOG_LEVEL: 'loud' });
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('DATABASE_URL');
  });

  it('never repeats a value, which could be a secret', () => {
    const message = failure({ DATABASE_URL: 'mysql://user:hunter2-secret@db/x' });
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('hunter2-secret');
  });
});

describe('starting the server', () => {
  const main = fileURLToPath(new URL('../main.ts', import.meta.url));
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [main], {
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
      timeout: 20_000,
    });

  it('exits with a clear message when settings are missing', () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is required');
  }, 25_000);

  it('refuses the development password when mode is not set', () => {
    const result = run({ DATABASE_URL: 'postgresql://remidy:remidy_dev_only@db/remidy' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('strong, unique password');
    expect(result.stderr).not.toContain('remidy_dev_only');
  }, 25_000);
});

describe('request IDs', () => {
  it('keeps a safe ID from the caller', () => {
    expect(requestId('abc-123_DEF')).toBe('abc-123_DEF');
  });

  it.each([
    ['log injection', 'abc123\n{"level":"fatal"}'],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['repeated header', ['abcdefgh', 'ijklmnop']],
    ['missing', undefined],
  ])('replaces an ID that is %s', (_name, value) => {
    expect(requestId(value)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is returned on every response', async () => {
    const app = buildApp({ database });
    const response = await app.inject({
      url: '/api/health',
      headers: { 'x-request-id': 'trace-me-please' },
    });
    expect(response.headers['x-request-id']).toBe('trace-me-please');
  });
});

describe('error format', () => {
  function appThatThrows(error: unknown) {
    return buildApp({ database, features: [testFeature(error)] });
  }

  it('answers unknown routes with the standard format', async () => {
    const response = await buildApp({ database }).inject({ url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    const { error } = apiErrorResponse.parse(response.json());
    expect(error.code).toBe('not_found');
    expect(error.requestId).toBe(response.headers['x-request-id']);
  });

  it('passes on an expected error, with its fields', async () => {
    const fields = [{ path: 'amount', message: 'Enter an amount.' }];
    const app = appThatThrows(new AppError(422, 'validation_failed', 'Check the form.', fields));
    const response = await app.inject({ url: '/api/boom' });
    expect(response.statusCode).toBe(422);
    expect(apiErrorResponse.parse(response.json()).error).toMatchObject({
      code: 'validation_failed',
      message: 'Check the form.',
      fields,
    });
  });

  it('hides the details of an unexpected error', async () => {
    const app = appThatThrows(new Error('connection to db:5432 failed for secret-user'));
    const response = await app.inject({ url: '/api/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret-user');
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('internal_error');
  });

  it('does not repeat malformed input', async () => {
    const response = await appThatThrows(null).inject({
      method: 'POST',
      url: '/api/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"oops": secret-input',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('secret-input');
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('bad_request');
  });

  it('rejects oversized requests', async () => {
    const response = await appThatThrows(null).inject({
      method: 'POST',
      url: '/api/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ data: 'x'.repeat(300 * 1024) }),
    });
    expect(response.statusCode).toBe(413);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('payload_too_large');
  });

  it('rejects unsupported content types', async () => {
    const response = await appThatThrows(null).inject({
      method: 'POST',
      url: '/api/echo',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(response.statusCode).toBe(415);
    expect(apiErrorResponse.parse(response.json()).error.code).toBe('unsupported_media_type');
  });
});

describe('logging', () => {
  function capture() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const app = buildApp({
      database,
      features: [testFeature()],
      logger: { ...(loggerOptions('info') as object), stream },
    });
    return { app, output: () => lines.join('') };
  }

  it('writes structured lines with the request ID', async () => {
    const { app, output } = capture();
    await app.inject({ url: '/api/thing', headers: { 'x-request-id': 'trace-me-please' } });
    const first = JSON.parse(output().split('\n')[0] ?? '') as { reqId: string };
    expect(first.reqId).toBe('trace-me-please');
  });

  it('leaves out query strings and headers', async () => {
    const { app, output } = capture();
    await app.inject({
      url: '/api/thing?token=query-secret',
      headers: { authorization: 'Bearer header-secret', cookie: 'session=cookie-secret' },
    });
    expect(output()).toContain('/thing');
    expect(output()).not.toContain('query-secret');
    expect(output()).not.toContain('header-secret');
    expect(output()).not.toContain('cookie-secret');
  });

  it('redacts secrets logged by mistake', async () => {
    const { app, output } = capture();
    app.log.info({ password: 'pw-secret', user: { token: 'tk-secret' } }, 'oops');
    await app.close();
    expect(output()).not.toContain('pw-secret');
    expect(output()).not.toContain('tk-secret');
    expect(output()).toContain('[redacted]');
  });

  it('records the details of an unexpected error', async () => {
    const { app, output } = capture();
    await app.inject({ url: '/api/boom' });
    expect(output()).toContain('real cause for the logs');
  });

  it('stays quiet about healthy health checks', async () => {
    const { app, output } = capture();
    await app.inject({ url: '/api/health' });
    expect(output()).not.toContain('/api/health');
  });
});
