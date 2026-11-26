import { type Page } from '@playwright/test';
import { mockSignedIn } from './support.ts';

// Bills, due dates and logos for tests with the server mocked, shared by Home, Bills and the Calendar.
export const iso = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// A drawn sample logo, like the ones in the sample data.
export const LOGO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA+ElEQVR4nO3bTQ6CQBBEYU7hWT2Tl9TExJ1RaOh50z2vktlC1cfKH7YtmNv98ZzpRHeUHDsMhR6AQtClUQS6LIpAl0QR6HIoAl0KR6ALoQB0GRyBLiKAAIsCfIICkE+ABngj0ONpBAFmGE8iDAf4FwE6A+xNS4CjaQUQTQuAsykNcFVKAlydUgBZEUCAAgDZEUAAAQQQYGaATISMrgIIkHDRDISsnn4czrz4FQjZ/fxKbMRNIgijevnLEHHTmY4AdAH6CEAXoI8A9P+E8PECCCCAACsi+L7Aym+NfB2/CsLP8d0Rdo3vinBofDeE0PgOEKeHV0KJ7ngBJ0TVH7i9YKwAAAAASUVORK5CYII=';
// Water has a logo, so the screens show both a logo and a lettered tile.
export const logoOf = (name: string) => (name === 'Water' ? 'l1' : null);

/** Chooses a day in the phone's month grid, found by its day of the month. */
export async function chooseDay(page: Page, day: string) {
  await page
    .getByRole('list', { name: /\d{4}$/ })
    .getByRole('button', { name: new RegExp(` ${String(Number(day.slice(8)))}(,|$)`) })
    .click();
}

// The mocked bills, so a due date opens its own bill.
export const BILL_IDS: Record<string, string> = { Rent: 'b1', Electric: 'b2', Water: 'b3' };

export const entry = (id: string, name: string, dueOn: string, expectedCents: number | null) => ({
  id,
  billId: BILL_IDS[name] ?? id,
  spaceId: 'sp1',
  shared: false,
  name,
  dueOn,
  expectedCents,
  isVariable: expectedCents === null,
  categoryName: 'Utilities',
  logoId: logoOf(name),
  autopay: name === 'Electric',
  state: 'open',
  paidCents: 0,
});

export const bill = (id: string, name: string, expectedCents: number | null) => ({
  id,
  spaceId: 'sp1',
  shared: false,
  name,
  merchant: null,
  expectedCents,
  isVariable: expectedCents === null,
  schedule: { kind: 'repeat', unit: 'month', every: 1, firstDue: '2026-01-15', lastDue: null },
  categoryId: null,
  categoryName: 'Utilities',
  // Electric pays itself, so the screens show a bill on auto-pay beside ones that don't.
  autopay: name === 'Electric',
  url: null,
  notes: null,
  logoId: logoOf(name),
  archived: false,
});

export async function withBills(page: Page) {
  await mockSignedIn(page);
  await page.route('**/api/v1/features', (route) =>
    route.fulfill({ json: { enabled: ['bills'] } }),
  );
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [entry('o1', 'Rent', iso(-3), 145_000)],
        upcoming: [entry('u1', 'Water', iso(2), 4_500), entry('u2', 'Electric', iso(5), null)],
      },
    }),
  );
  await page.route('**/api/v1/bills', (route) =>
    route.fulfill({
      json: [bill('b1', 'Rent', 145_000), bill('b2', 'Electric', null), bill('b3', 'Water', 4_500)],
    }),
  );
  await page.route('**/api/v1/logos/*', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(LOGO_PNG, 'base64') }),
  );
}

/**
 * The same bills with the browser's clock pinned to the 10th of this month, for tests that need
 * every bill in the month shown even when today is near its end. Returns a day of this month.
 */
export async function withBillsMidMonth(page: Page) {
  await withBills(page);
  const now = new Date();
  const day = (date: number) => {
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${String(now.getFullYear())}-${month}-${String(date).padStart(2, '0')}`;
  };
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 10, 12));
  await page.route('**/api/v1/agenda?**', (route) =>
    route.fulfill({
      json: {
        overdue: [entry('o1', 'Rent', day(7), 145_000)],
        upcoming: [entry('u1', 'Water', day(12), 4_500), entry('u2', 'Electric', day(15), null)],
      },
    }),
  );
  return day;
}
