import { describe, expect, it } from 'vitest';
import { addSampleData } from '../../core/sample-data.ts';
import { listBills } from './repo.ts';
import { addSampleBills, SAMPLE_BILLS } from './sample-data.ts';
import { ids, test, useBillsHarness } from './testing.ts';

useBillsHarness();

const run = (fresh = false) =>
  addSampleBills(
    { database: test.database },
    {
      userId: ids.alice,
      personalSpaceId: ids.alicePersonal,
      householdId: ids.household,
      fresh,
    },
  );

describe('sample bills', () => {
  it('adds every sample bill through the real rules, personal and shared', async () => {
    expect(await run()).toBe(`added ${String(SAMPLE_BILLS.length)} sample bills`);
    const bills = await listBills(test.database.orm, ids.alice);
    expect(bills).toHaveLength(SAMPLE_BILLS.length);
    expect(bills.filter((bill) => bill.archived).map((bill) => bill.name)).toEqual([
      'Old magazine subscription',
    ]);
    // Categories come from the household, and every sample names one that exists.
    expect(bills.every((bill) => bill.categoryName !== null)).toBe(true);
    // Bob only sees the shared ones.
    const bobs = await listBills(test.database.orm, ids.bob);
    expect(bobs.length).toBe(SAMPLE_BILLS.filter((bill) => bill.shared).length);
  });

  it('can run again without adding duplicates, and leaves other bills alone', async () => {
    await run();
    expect(await run()).toMatch(/already there/);
    expect(await listBills(test.database.orm, ids.alice)).toHaveLength(SAMPLE_BILLS.length);
  });

  it('replaces the sample bills when asked, keeping anything else', async () => {
    await run();
    const before = new Set((await listBills(test.database.orm, ids.alice)).map((bill) => bill.id));
    expect(await run(true)).toMatch(/replacing/);
    const after = await listBills(test.database.orm, ids.alice);
    expect(after).toHaveLength(SAMPLE_BILLS.length);
    expect(after.some((bill) => before.has(bill.id))).toBe(false);
  });
});

describe('the sample data command', () => {
  it('refuses to run in production', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://remidy.example.com',
      AUTH_SECRET: 'a-long-enough-secret-for-the-config-check-to-pass',
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      DATABASE_URL: 'postgresql://remidy:a-strong-test-password@localhost:5432/remidy',
    });
    try {
      await expect(addSampleData([], [])).rejects.toThrow(/development only/);
    } finally {
      process.env = saved;
    }
  });
});
