import { instanceSetting, logo } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../core/app.ts';
import { createEncryptor } from '../../core/encryption.ts';
import { AppError } from '../../core/errors.ts';
import type { Authorize } from '../../core/feature.ts';
import { OutboundError } from '../../core/outbound.ts';
import type { Fetch } from './fetch.ts';
import { drawSampleLogo, logosFeature } from './index.ts';

const PUBLIC_URL = 'https://remidy.test';
const KEYS = { publishableKey: 'pk_test1234', secretKey: 'sk_secret5678' };
const WEBSITE_ICON = drawSampleLogo([22, 120, 170], 'drop');
const LOGO_DEV_ICON = drawSampleLogo([200, 40, 60], 'circle');

let test: TestDatabase;
let app: FastifyInstance;
/** What the pretend internet answers. Anything not listed can't be reached. */
let internet: Record<string, Buffer | string> = {};
let asked: string[] = [];

const fakeFetch: Fetch = (url) => {
  asked.push(url.href);
  const answer = internet[url.href];
  if (answer === undefined) return Promise.reject(new OutboundError('It couldn’t be reached.'));
  const body = typeof answer === 'string' ? Buffer.from(answer) : answer;
  return Promise.resolve({
    url,
    contentType: typeof answer === 'string' ? 'text/html' : 'image/png',
    body,
  });
};

// Admins are marked by a header here. Sign-in itself is tested elsewhere.
const authorize: Authorize = (access, request) => {
  const isInstanceAdmin = request.headers['x-test-admin'] === 'yes';
  if (access === 'instance-admin' && !isInstanceAdmin) {
    return Promise.reject(new AppError(404, 'not_found', 'That wasn’t found.'));
  }
  return Promise.resolve({
    user: { userId: 'alice', email: 'alice@example.com', name: 'Alice', isInstanceAdmin },
    space: null,
  });
};

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  admin = false,
) =>
  app.inject({
    method,
    url,
    headers: { origin: PUBLIC_URL, ...(admin ? { 'x-test-admin': 'yes' } : {}) },
    ...(payload ? { payload } : {}),
  });

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  app = buildApp({
    database: test.database,
    features: [logosFeature(() => fakeFetch)],
    authorize,
    publicUrl: PUBLIC_URL,
    encryptor: createEncryptor(Buffer.alloc(32, 3).toString('base64')),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await test.stop();
});

beforeEach(async () => {
  await test.database.orm.execute(sql`truncate logo, instance_setting cascade`);
  internet = {};
  asked = [];
});

const website = 'https://power.example/';
const searchUrl = 'https://api.logo.dev/search?q=City+Power';
const imageUrl = (domain: string) =>
  `https://img.logo.dev/${domain}?token=pk_test1234&size=128&format=png&fallback=404`;

const suggest = async (body: object) => {
  const response = await call('POST', '/api/v1/logos/suggest', body);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ options: { logoId: string; label: string; source: string }[] }>().options;
};

describe('finding logos', () => {
  it('offers the website’s icon, and asks no one else, without Logo.dev', async () => {
    internet = { [website]: '<head></head>', 'https://power.example/favicon.ico': WEBSITE_ICON };
    const options = await suggest({ name: 'City Power', url: website });
    expect(options.map(({ label, source }) => ({ label, source }))).toEqual([
      { label: 'power.example', source: 'website' },
    ]);
    expect(asked.every((url) => url.startsWith('https://power.example/'))).toBe(true);
    // What was found can be loaded.
    const image = await call('GET', `/api/v1/logos/${options[0]?.logoId ?? ''}`);
    expect(image.rawPayload.equals(WEBSITE_ICON)).toBe(true);
  });

  it('looks nothing up for a bill with no website and no Logo.dev', async () => {
    expect(await suggest({ name: 'City Power' })).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('puts Logo.dev’s matches first once it’s set up, then the website’s icon', async () => {
    expect((await call('PUT', '/api/v1/admin/settings/logo-dev', KEYS, true)).statusCode).toBe(200);
    internet = {
      [searchUrl]: JSON.stringify([
        { name: 'City Power', domain: 'citypower.example' },
        { name: 'No logo', domain: 'nologo.example' },
      ]),
      [imageUrl('citypower.example')]: LOGO_DEV_ICON,
      [website]: '<head></head>',
      'https://power.example/favicon.ico': WEBSITE_ICON,
    };
    const options = await suggest({ name: 'City Power', url: website });
    expect(options.map((option) => [option.label, option.source])).toEqual([
      ['City Power', 'logo.dev'],
      ['power.example', 'website'],
    ]);
  });

  it('offers the same image once, wherever it was found', async () => {
    await call('PUT', '/api/v1/admin/settings/logo-dev', KEYS, true);
    internet = {
      [searchUrl]: JSON.stringify([{ name: 'City Power', domain: 'power.example' }]),
      [imageUrl('power.example')]: WEBSITE_ICON,
      [website]: '<head></head>',
      'https://power.example/favicon.ico': WEBSITE_ICON,
    };
    expect(await suggest({ name: 'City Power', url: website })).toHaveLength(1);
  });

  it('still answers when Logo.dev fails', async () => {
    await call('PUT', '/api/v1/admin/settings/logo-dev', KEYS, true);
    internet = { [searchUrl]: 'not json' };
    expect(await suggest({ name: 'City Power' })).toEqual([]);
  });

  it('refuses a website that isn’t a web address', async () => {
    const response = await call('POST', '/api/v1/logos/suggest', {
      name: 'City Power',
      url: 'file:///etc/passwd',
    });
    expect(response.statusCode).toBe(422);
    expect(asked).toEqual([]);
  });
});

describe('uploading a logo', () => {
  const upload = (bytes: Buffer) =>
    call('POST', '/api/v1/logos', { image: bytes.toString('base64') });

  it('stores an image and says its ID', async () => {
    const response = await upload(WEBSITE_ICON);
    expect(response.statusCode).toBe(201);
    const { logoId } = response.json<{ logoId: string }>();
    expect((await call('GET', `/api/v1/logos/${logoId}`)).statusCode).toBe(200);
  });

  it('refuses SVG and other files, whatever they’re called', async () => {
    const response = await upload(Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(response.statusCode).toBe(422);
    expect(await test.database.orm.select().from(logo)).toEqual([]);
  });

  it('refuses an image over 256 KB', async () => {
    const big = Buffer.concat([WEBSITE_ICON, Buffer.alloc(256 * 1024)]);
    expect((await upload(big)).statusCode).toBe(422);
  });

  it('refuses something that isn’t base64', async () => {
    expect((await call('POST', '/api/v1/logos', { image: '<<<not base64>>>' })).statusCode).toBe(
      422,
    );
  });
});

describe('the Logo.dev keys', () => {
  const path = '/api/v1/admin/settings/logo-dev';

  it('are stored encrypted, and never sent back', async () => {
    expect((await call('GET', path, undefined, true)).json()).toEqual({
      configured: false,
      updatedAt: null,
    });
    const saved = await call('PUT', path, KEYS, true);
    expect(saved.json()).toMatchObject({ configured: true });
    expect(Object.keys(saved.json<object>()).sort()).toEqual(['configured', 'updatedAt']);
    expect(saved.body).not.toContain('sk_');
    const [stored] = await test.database.orm.select().from(instanceSetting);
    expect(stored?.value).not.toContain('sk_secret5678');
    expect(stored?.value).not.toContain('pk_test1234');
    expect(stored?.updatedBy).toBe('alice');
  });

  it('can be removed', async () => {
    await call('PUT', path, KEYS, true);
    expect((await call('DELETE', path, undefined, true)).statusCode).toBe(204);
    expect((await call('GET', path, undefined, true)).json()).toMatchObject({ configured: false });
  });

  it('must look like Logo.dev keys', async () => {
    const response = await call(
      'PUT',
      path,
      { publishableKey: 'sk_wrong123', secretKey: 'x' },
      true,
    );
    expect(response.statusCode).toBe(422);
  });

  it('can’t be seen or changed by anyone but an instance admin', async () => {
    expect((await call('GET', path)).statusCode).toBe(404);
    expect((await call('PUT', path, KEYS)).statusCode).toBe(404);
    expect((await call('DELETE', path)).statusCode).toBe(404);
    expect(await test.database.orm.select().from(instanceSetting)).toEqual([]);
  });
});
