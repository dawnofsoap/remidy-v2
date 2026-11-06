/**
 * Money is always a whole number of cents, in the database, the API and here.
 * It only becomes text for display, and never passes through a decimal number,
 * so 0.1 + 0.2 style rounding errors can't happen.
 */
declare const centsBrand: unique symbol;
export type Cents = number & { readonly [centsBrand]: true };

/** $999,999,999.99. Far beyond any household bill, and well inside the range numbers are exact. */
export const MAX_CENTS = 99_999_999_999;

function isCents(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_CENTS;
}

/** Checks a whole number of cents, for values that come from outside, such as the database. */
export function toCents(value: number): Cents {
  if (!isCents(value)) {
    throw new RangeError(`Not a valid amount of cents: ${String(value)}`);
  }
  return value as Cents;
}

// Optional $, then digits with correctly placed commas or none, then up to two decimals.
const MONEY_PATTERN = /^\$?(?<whole>\d{1,3}(?:,\d{3})+|\d+)?(?:\.(?<fraction>\d{1,2}))?$/;

/**
 * Reads an amount a person typed. Returns null if it isn't one, or is negative or too large.
 * Accepts `1234.5`, `$1,234.50` and `.50`. Rejects `1,23`, `1.234` and `-5`.
 */
export function parseMoney(text: string): Cents | null {
  const match = MONEY_PATTERN.exec(text.trim());
  const whole = match?.groups?.whole;
  const fraction = match?.groups?.fraction;
  if (whole === undefined && fraction === undefined) return null;

  const dollars = Number((whole ?? '0').replaceAll(',', ''));
  const cents = Number((fraction ?? '').padEnd(2, '0'));
  const total = dollars * 100 + cents;
  return isCents(total) ? (total as Cents) : null;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/g, ',');
}

function splitCents(cents: Cents): { dollars: string; pennies: string } {
  const absolute = Math.abs(cents);
  return {
    dollars: String(Math.floor(absolute / 100)),
    pennies: String(absolute % 100).padStart(2, '0'),
  };
}

/** For display, such as `$1,234.50` or `-$5.00`. */
export function formatMoney(cents: Cents): string {
  const { dollars, pennies } = splitCents(cents);
  return `${cents < 0 ? '-' : ''}$${groupThousands(dollars)}.${pennies}`;
}

/** For a form field, such as `1234.50`. Only meaningful for amounts a person can enter. */
export function moneyInputValue(cents: Cents): string {
  const { dollars, pennies } = splitCents(cents);
  return `${cents < 0 ? '-' : ''}${dollars}.${pennies}`;
}

/** Adds amounts, refusing a total too large to trust rather than returning a wrong one. */
export function sumCents(amounts: readonly Cents[]): Cents {
  return toCents(amounts.reduce<number>((total, amount) => total + amount, 0));
}
