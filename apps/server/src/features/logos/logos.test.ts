import { bill, logo, membership, space, user } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { imageTypeOf } from '@remidy/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../core/app.ts';
import type { Authorize } from '../../core/feature.ts';
import { drawSampleLogo, logos, storeLogo } from './index.ts';
import { deleteUnusedLogos } from './repo.ts';

const PUBLIC_URL = 'https://remidy.test';
let test: TestDatabase;
let app: FastifyInstance;

const authorize: Authorize = (_access, request) =>
  Promise.resolve({
    user: {
      userId: String(request.headers['x-test-user']),
      email: 'alice@example.com',
      name: 'Alice',
      isInstanceAdmin: false,
    },
    space: null,
  });

const png = () => drawSampleLogo([30, 90, 160], 'circle');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  app = buildApp({ database: test.database, features: [logos], authorize, publicUrl: PUBLIC_URL });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app.close();
  await test.stop();
});

beforeEach(async () => {
  await test.database.orm.execute(sql`truncate logo, bill, membership, space, "user" cascade`);
});

describe('storing logos', () => {
  it('stores an image once, by its contents', async () => {
    const first = await storeLogo(test.database.orm, png());
    const again = await storeLogo(test.database.orm, png());
    const other = await storeLogo(test.database.orm, drawSampleLogo([30, 90, 160], 'ring'));
    expect(again).toBe(first);
    expect(other).not.toBe(first);
    const [row] = await test.database.orm
      .select({ type: logo.contentType })
      .from(logo)
      .where(eq(logo.id, first));
    expect(row?.type).toBe('image/png');
  });

  it.each([
    ['SVG, which can carry scripts', svg],
    ['an empty file', Buffer.alloc(0)],
    ['an image over 256 KB', Buffer.concat([png(), Buffer.alloc(256 * 1024)])],
  ])('refuses %s', async (_name, bytes) => {
    await expect(storeLogo(test.database.orm, bytes)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('is refused by the database too, if the checks were skipped', async () => {
    const insert = (bytes: Buffer, contentType: 'image/png') =>
      test.database.orm.insert(logo).values({ sha256: String(bytes.length), contentType, bytes });
    await expect(insert(Buffer.alloc(256 * 1024 + 1, 1), 'image/png')).rejects.toThrow();
    await expect(
      test.database.orm.execute(
        sql`insert into logo (sha256, content_type, bytes) values ('x', 'image/svg+xml', '\\x3c')`,
      ),
    ).rejects.toThrow();
  });

  it('can’t be changed once stored', async () => {
    const id = await storeLogo(test.database.orm, png());
    await expect(
      test.database.orm.update(logo).set({ contentType: 'image/gif' }).where(eq(logo.id, id)),
    ).rejects.toThrow();
  });
});

describe('serving logos', () => {
  const get = (id: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/logos/${id}`,
      headers: { origin: PUBLIC_URL, 'x-test-user': 'alice' },
    });

  it('serves the image with the type found from its bytes, cached for a year', async () => {
    const id = await storeLogo(test.database.orm, png());
    const response = await get(id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.rawPayload.equals(png())).toBe(true);
  });

  it('says a missing or malformed logo wasn’t found', async () => {
    expect((await get('0198c0de-0000-7000-8000-000000000000')).statusCode).toBe(404);
    expect((await get('not-an-id')).statusCode).toBe(422);
  });
});

describe('cleaning up', () => {
  async function addBillUsing(logoId: string) {
    const { orm } = test.database;
    await orm.insert(user).values({ id: 'alice', name: 'Alice', email: 'alice@example.com' });
    const [made] = await orm
      .insert(space)
      .values({ name: 'Personal', kind: 'personal' })
      .returning({ id: space.id });
    const spaceId = made?.id ?? '';
    await orm.insert(membership).values({ userId: 'alice', spaceId, role: 'owner' });
    await orm.insert(bill).values({
      spaceId,
      name: 'Water',
      expectedCents: 4500,
      schedule: { kind: 'once', firstDue: '2026-01-15' },
      logoId,
    });
  }
  async function age(id: string, interval: string) {
    const { orm } = test.database;
    await orm.execute(sql`alter table logo disable trigger logo_unchanging`);
    await orm.execute(
      sql`update logo set created_at = now() - ${interval}::interval where id = ${id}`,
    );
    await orm.execute(sql`alter table logo enable trigger logo_unchanging`);
  }

  it('deletes logos no bill has used for a day, and keeps the rest', async () => {
    const { orm } = test.database;
    const used = await storeLogo(orm, png());
    const unusedOld = await storeLogo(orm, drawSampleLogo([200, 60, 40], 'diamond'));
    const unusedNew = await storeLogo(orm, drawSampleLogo([40, 140, 60], 'bars'));
    await addBillUsing(used);
    for (const id of [used, unusedOld]) await age(id, '2 days');

    expect(await deleteUnusedLogos(orm)).toBe(1);
    const left = (await orm.select({ id: logo.id }).from(logo)).map((row) => row.id).sort();
    expect(left).toEqual([used, unusedNew].sort());
  });
});

describe('sample logos', () => {
  it('are real PNG images, different for each color and shape', () => {
    const shapes = ['circle', 'diamond', 'stripes', 'ring', 'bars', 'drop'] as const;
    const drawn = shapes.map((shape) => drawSampleLogo([90, 60, 170], shape));
    for (const image of drawn) expect(imageTypeOf(image)).toBe('image/png');
    expect(new Set(drawn.map((image) => image.toString('base64'))).size).toBe(shapes.length);
  });
});
