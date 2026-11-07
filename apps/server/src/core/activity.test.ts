import { activityLog, space, type Orm } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordActivity } from './activity.ts';

let test: TestDatabase;
let orm: Orm;
let spaceId: string;

const rows = () => orm.select().from(activityLog);
const entry = (overrides = {}) => ({
  spaceId,
  actorId: 'user-1',
  entity: 'bill',
  entityId: randomUUID(),
  action: 'updated',
  before: { name: 'Water' },
  after: { name: 'Water bill' },
  ...overrides,
});

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
  orm = test.database.orm;
}, 180_000);

afterAll(async () => {
  await test.stop();
});

beforeEach(async () => {
  await orm.execute(sql`truncate activity_log, space cascade`);
  const [created] = await orm
    .insert(space)
    .values({ name: 'Household', kind: 'shared' })
    .returning({ id: space.id });
  spaceId = created?.id ?? '';
});

describe('recording a change', () => {
  it('stores what happened, who did it and when', async () => {
    const details = entry();
    await orm.transaction((transaction) => recordActivity(transaction, details));
    const [row] = await rows();
    expect(row).toMatchObject(details);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('allows changes made by Remidy itself, with nothing before or after', async () => {
    await orm.transaction((transaction) =>
      recordActivity(transaction, {
        spaceId,
        actorId: null,
        entity: 'bill',
        entityId: randomUUID(),
        action: 'generated',
      }),
    );
    const [row] = await rows();
    expect(row).toMatchObject({ actorId: null, before: null, after: null });
  });

  it('is undone along with the change if the change fails', async () => {
    await expect(
      orm.transaction(async (transaction) => {
        await recordActivity(transaction, entry());
        throw new Error('The change failed.');
      }),
    ).rejects.toThrow('The change failed.');
    expect(await rows()).toHaveLength(0);
  });

  it('undoes the change if it can’t be recorded', async () => {
    await expect(
      orm.transaction(async (transaction) => {
        await transaction.update(space).set({ name: 'Changed' }).where(eq(space.id, spaceId));
        await recordActivity(transaction, entry({ spaceId: randomUUID() }));
      }),
    ).rejects.toThrow();
    const [row] = await orm.select().from(space).where(eq(space.id, spaceId));
    expect(row?.name).toBe('Household');
  });
});

describe('keeping secrets out', () => {
  it.each([
    ['password', { password: 'x' }],
    ['passcode', { passcode: 'x' }],
    ['a token', { resetToken: 'x' }],
    ['a secret', { mfaSecret: 'x' }],
    ['a credential', { credentials: 'x' }],
    ['an API key', { api_key: 'x' }],
    ['a private key', { privateKey: 'x' }],
    ['a hash', { passwordHash: 'x' }],
    ['one nested in an object', { account: { login: { password: 'x' } } }],
    ['one nested in a list', { accounts: [{ token: 'x' }] }],
  ])('refuses %s, and undoes the change', async (_name, after) => {
    await expect(
      orm.transaction(async (transaction) => {
        await transaction.update(space).set({ name: 'Changed' }).where(eq(space.id, spaceId));
        await recordActivity(transaction, entry({ after }));
      }),
    ).rejects.toThrow(/looks like a secret/);
    expect(await rows()).toHaveLength(0);
    const [row] = await orm.select().from(space).where(eq(space.id, spaceId));
    expect(row?.name).toBe('Household');
  });

  it('checks what was there before too, and names the field but not the value', async () => {
    await expect(
      orm.transaction((transaction) =>
        recordActivity(transaction, entry({ before: { password: 'hunter2-value' } })),
      ),
    ).rejects.toThrow(/"password"/);
    await expect(
      orm.transaction((transaction) =>
        recordActivity(transaction, entry({ before: { password: 'hunter2-value' } })),
      ),
    ).rejects.not.toThrow(/hunter2-value/);
  });

  it('allows ordinary fields', async () => {
    const after = { name: 'Rent', amountCents: 120000, dueOn: '2026-03-08', notes: [{ a: 1 }] };
    await orm.transaction((transaction) => recordActivity(transaction, entry({ after })));
    expect((await rows())[0]?.after).toEqual(after);
  });
});

describe('the record can’t be rewritten', () => {
  beforeEach(async () => {
    await orm.transaction((transaction) => recordActivity(transaction, entry()));
  });

  it('refuses a change, even from code with full database access', async () => {
    await expect(orm.update(activityLog).set({ action: 'forged' })).rejects.toThrow();
    expect((await rows())[0]?.action).toBe('updated');
  });

  it('refuses a delete', async () => {
    await expect(orm.delete(activityLog)).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });

  it('keeps a space with history from being deleted', async () => {
    await expect(orm.delete(space).where(eq(space.id, spaceId))).rejects.toThrow();
    expect(await rows()).toHaveLength(1);
  });

  it('still takes new records', async () => {
    await orm.transaction((transaction) => recordActivity(transaction, entry()));
    expect(await rows()).toHaveLength(2);
  });
});
