import { describe, expect, it } from 'vitest';
import { NotAV1Export, readV1Date, readV1Export, readV1Frequency } from './v1-export.ts';

// Shaped like v1's export: bills, payment accounts and categories, with v1's column names.
const bill = (overrides: Record<string, unknown> = {}) => ({
  bill_name: 'Water',
  amount: '45.00',
  is_variable_amount: false,
  billing_frequency: 'monthly',
  due_day: 15,
  start_date: '2026-01-15',
  end_date: null,
  category: 'Utilities',
  payment_account_name: 'Everyday checking',
  auto_pay: false,
  is_active: true,
  url: 'https://example.com/water',
  notes: null,
  ownership: 'household',
  ...overrides,
});

const exportOf = (bills: unknown[], extra: Record<string, unknown> = {}) => ({
  exportDate: '2026-03-10T15:04:05.000Z',
  exportVersion: '1.0',
  bills,
  payments: [{ amount: '45.00' }],
  paymentAccounts: [],
  categories: [],
  ...extra,
});

describe('reading v1 dates', () => {
  it.each([
    ['2026-01-15', '2026-01-15'],
    ['2026-01-15T00:00:00.000Z', '2026-01-15'],
    // Midnight in Chicago.
    ['2026-01-15T06:00:00.000Z', '2026-01-15'],
    // Midnight in Tokyo, pushed back a day.
    ['2026-01-14T15:00:00.000Z', '2026-01-15'],
    ['2026-12-31T15:00:00.000Z', '2027-01-01'],
  ])('reads %s as %s', (raw, expected) => {
    expect(readV1Date(raw)).toBe(expected);
  });

  it.each([null, '', 'soon', '2026-02-30', 42])('reads %s as no date', (raw) => {
    expect(readV1Date(raw)).toBeNull();
  });
});

describe('reading v1 frequencies', () => {
  it.each([
    ['one-time', { kind: 'once' }],
    ['weekly', { kind: 'repeat', unit: 'week', every: 1 }],
    ['biweekly', { kind: 'repeat', unit: 'week', every: 2 }],
    ['monthly', { kind: 'repeat', unit: 'month', every: 1 }],
    ['Monthly', { kind: 'repeat', unit: 'month', every: 1 }],
    ['quarterly', { kind: 'repeat', unit: 'month', every: 3 }],
    ['annually', { kind: 'repeat', unit: 'year', every: 1 }],
    ['yearly', { kind: 'repeat', unit: 'year', every: 1 }],
    ['6-weekly', { kind: 'repeat', unit: 'week', every: 6 }],
    ['2-monthly', { kind: 'repeat', unit: 'month', every: 2 }],
    ['3-yearly', { kind: 'repeat', unit: 'year', every: 3 }],
    // v1 treated a missing frequency as monthly.
    [null, { kind: 'repeat', unit: 'month', every: 1 }],
  ])('reads %s', (raw, expected) => {
    expect(readV1Frequency(raw)).toEqual(expected);
  });

  it.each(['semimonthly', '0-weekly', 'daily', '100-monthly'])(
    'refuses %s, rather than guessing the way v1 did',
    (raw) => {
      expect(readV1Frequency(raw)).toBeNull();
    },
  );
});

describe('reading a v1 export', () => {
  it('turns a bill into one ready to review', () => {
    const { bills, skipped } = readV1Export(exportOf([bill()]));
    expect(skipped).toEqual([]);
    expect(bills).toEqual([
      {
        name: 'Water',
        cents: 4500,
        isVariable: false,
        schedule: {
          kind: 'repeat',
          unit: 'month',
          every: 1,
          firstDue: '2026-01-15',
          lastDue: null,
        },
        categoryName: 'Utilities',
        accountName: 'Everyday checking',
        autopay: false,
        shared: true,
        archived: false,
        url: 'https://example.com/water',
        notes: null,
      },
    ]);
  });

  it('keeps personal, ended, stopped, auto-pay and varying bills as they were', () => {
    const { bills } = readV1Export(
      exportOf([
        bill({
          ownership: 'personal',
          end_date: '2027-06-15',
          is_active: false,
          auto_pay: true,
          is_variable_amount: true,
          amount: '0.00',
        }),
      ]),
    );
    expect(bills[0]).toMatchObject({
      shared: false,
      archived: true,
      autopay: true,
      isVariable: true,
      cents: null,
      schedule: { lastDue: '2027-06-15' },
    });
  });

  it('reads a one-time bill, a number amount, and a bill from before start dates', () => {
    const { bills } = readV1Export(
      exportOf([
        bill({ billing_frequency: 'one-time', amount: 150 }),
        bill({ bill_name: 'Old', start_date: null, due_day: 31 }),
      ]),
    );
    expect(bills[0]).toMatchObject({
      cents: 15000,
      schedule: { kind: 'once', firstDue: '2026-01-15' },
    });
    // The due day in the month the export was made, or the month's last day.
    expect(bills[1]?.schedule.firstDue).toBe('2026-03-31');
  });

  it('reads a due day stored as text, and an export without a date', () => {
    const { bills } = readV1Export({
      ...exportOf([bill({ start_date: null, due_day: '10' })]),
      exportDate: null,
    });
    // Without the export's date, the due day falls in January 2026, when v2's history begins.
    expect(bills[0]?.schedule.firstDue).toBe('2026-01-10');
  });

  it('uses a shorter month’s last day, and names a bill with no name', () => {
    const { bills, skipped } = readV1Export({
      exportDate: '2026-04-10',
      exportVersion: '1.0',
      bills: [
        bill({ bill_name: null, start_date: null, due_day: 31 }),
        bill({ bill_name: '', billing_frequency: 'daily' }),
      ],
    });
    expect(bills[0]).toMatchObject({ name: 'Unnamed bill', schedule: { firstDue: '2026-04-30' } });
    expect(skipped[0]?.name).toBe('Unnamed bill');
  });

  it('skips bills it can’t read, saying why, and keeps the rest', () => {
    const { bills, skipped } = readV1Export(
      exportOf([
        bill({ bill_name: 'Twice a month', billing_frequency: 'semimonthly' }),
        bill({ bill_name: 'No date', start_date: null, due_day: null }),
        bill({ bill_name: 'Bad amount', amount: 'lots' }),
        bill({ bill_name: 'No amount', amount: null }),
        bill({ bill_name: 'Fine' }),
        'not a bill',
      ]),
    );
    expect(bills.map((item) => item.name)).toEqual(['Fine']);
    expect(skipped.map((item) => item.name)).toEqual([
      'Twice a month',
      'No date',
      'Bad amount',
      'No amount',
    ]);
    expect(skipped[0]?.reason).toMatch(/semimonthly/);
  });

  it('collects categories from the list and from bills, once each, in order', () => {
    const { categoryNames } = readV1Export(
      exportOf(
        [bill({ category: 'Utilities' }), bill({ category: 'Pets' }), bill({ category: null })],
        {
          categories: [{ name: 'Housing' }, { name: 'Utilities' }, { name: '  ' }],
        },
      ),
    );
    expect(categoryNames).toEqual(['Housing', 'Pets', 'Utilities']);
  });

  it('reads accounts, keeping only the last four digits', () => {
    const { accounts } = readV1Export(
      exportOf([], {
        paymentAccounts: [
          {
            account_name: 'Rewards card',
            account_type: 'credit_card',
            institution_name: 'Example Bank',
            last_four: '4242',
            ownership: 'personal',
            is_active: true,
          },
          {
            account_name: 'Odd',
            account_type: 'crypto',
            last_four: '4242 1234',
            ownership: 'household',
            is_active: false,
          },
          { account_name: '' },
        ],
      }),
    );
    expect(accounts).toEqual([
      {
        name: 'Rewards card',
        type: 'credit_card',
        institution: 'Example Bank',
        lastFour: '4242',
        shared: false,
        archived: false,
      },
      {
        name: 'Odd',
        type: 'other',
        institution: null,
        lastFour: null,
        shared: true,
        archived: true,
      },
    ]);
  });

  it.each([null, [], 'text', {}, { bills: [] }, { exportVersion: '1.0', bills: 'nope' }])(
    'refuses %j, which isn’t a v1 export',
    (json) => {
      expect(() => readV1Export(json)).toThrow(NotAV1Export);
    },
  );

  it('never reads v1’s payment history', () => {
    expect(Object.keys(readV1Export(exportOf([])))).not.toContain('payments');
  });
});
