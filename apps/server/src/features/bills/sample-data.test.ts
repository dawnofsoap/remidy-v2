import { bill, billOccurrence, payment } from '@remidy/db';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { unavailableEncryptor } from '../../core/encryption.ts';
import { addSampleData } from '../../core/sample-data.ts';
import { listBills } from './repo.ts';
import { addSampleBills, SAMPLE_BILLS } from './sample-data.ts';
import { ids, test, useBillsHarness } from './testing.ts';

useBillsHarness();

const run = () =>
  addSampleBills(
    { database: test.database, encryptor: unavailableEncryptor },
    { userId: ids.alice, personalSpaceId: ids.alicePersonal, householdId: ids.household },
  );

const paymentCount = async () => {
  const [row] = await test.database.orm
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(payment);
  return row?.n ?? 0;
};

describe('sample bills', () => {
  it('adds every sample bill through the real rules, personal and shared', async () => {
    expect(await run()).toBe(`added ${String(SAMPLE_BILLS.length)} sample bills, with payments`);
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

  it('shows every payment state: paid, partly paid, voided, skipped and auto-pay', async () => {
    await run();
    const states = await test.database.orm
      .select({ state: billOccurrence.state })
      .from(billOccurrence)
      .groupBy(billOccurrence.state);
    expect(states.map((row) => row.state).sort()).toEqual(['open', 'settled', 'skipped']);
    const [kinds] = await test.database.orm
      .select({
        voided: sql<number>`count(*) filter (where ${payment.voidedAt} is not null)`.mapWith(
          Number,
        ),
        autopay: sql<number>`count(*) filter (where ${payment.source} = 'autopay')`.mapWith(Number),
      })
      .from(payment);
    expect(kinds?.voided).toBe(1);
    expect(kinds?.autopay).toBeGreaterThan(0);
    const partly = await test.database.orm
      .select({ id: payment.id })
      .from(payment)
      .where(eq(payment.notes, 'The rest next week.'));
    expect(partly).toHaveLength(1);
  });

  it('gives most bills a drawn logo, and leaves some with none', async () => {
    await run();
    const bills = await listBills(test.database.orm, ids.alice);
    const withLogo = bills.filter((bill) => bill.logoId !== null);
    expect(withLogo).toHaveLength(SAMPLE_BILLS.filter((bill) => bill.logo).length);
    expect(withLogo.length).toBeLessThan(bills.length);
  });

  it('adds logos to sample bills made before logos existed', async () => {
    await run();
    await test.database.orm.update(bill).set({ logoId: null });
    expect(await run()).toMatch(/already there, and 10 got logos/);
    const bills = await listBills(test.database.orm, ids.alice);
    expect(bills.filter((row) => row.logoId !== null)).toHaveLength(10);
  });

  it('can run again without adding duplicates or paying twice', async () => {
    await run();
    const before = await paymentCount();
    expect(await run()).toMatch(/already there/);
    expect(await listBills(test.database.orm, ids.alice)).toHaveLength(SAMPLE_BILLS.length);
    expect(await paymentCount()).toBe(before);
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
      await expect(addSampleData([])).rejects.toThrow(/development only/);
    } finally {
      process.env = saved;
    }
  });
});
