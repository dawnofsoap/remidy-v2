import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  MAX_CENTS,
  moneyInputValue,
  parseMoney,
  sumCents,
  toCents,
  type Cents,
} from './money.ts';

const anyCents = fc.integer({ min: 0, max: MAX_CENTS }).map((value) => toCents(value));

describe('parseMoney', () => {
  it.each([
    ['0', 0],
    ['5', 500],
    ['5.', 500],
    ['$5', 500],
    ['$5.', 500],
    ['$ 5', 500],
    ['1,000', 100000],
    ['1,000.', 100000],
    ['$.5', 50],
    ['5.5', 550],
    ['5.05', 505],
    ['.5', 50],
    ['.05', 5],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['$1,234,567.89', 123456789],
    ['  $42.50  ', 4250],
    ['142.50', 14250],
    // Classic values that go wrong through decimal numbers.
    ['1.10', 110],
    ['4.35', 435],
    ['1.15', 115],
    ['8.29', 829],
    ['999999999.99', MAX_CENTS],
  ])('reads %s', (text, expected) => {
    expect(parseMoney(text)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['$'],
    ['.'],
    ['$.'],
    ['abc'],
    ['12a'],
    ['-5'],
    ['+5'],
    ['1.234'],
    ['1,23'],
    ['1,2345'],
    ['12,34.56'],
    [',123'],
    ['1,,234'],
    ['1e5'],
    ['0x10'],
    ['Infinity'],
    ['NaN'],
    ['$$5'],
    ['5$'],
    ['1 000'],
    ['5 .50'],
    ['1000000000'],
    ['999999999999999999999'],
  ])('rejects %j', (text) => {
    expect(parseMoney(text)).toBeNull();
  });

  it('reads back anything it formats', () => {
    fc.assert(
      fc.property(anyCents, (cents) => {
        expect(parseMoney(formatMoney(cents))).toBe(cents);
        expect(parseMoney(moneyInputValue(cents))).toBe(cents);
      }),
    );
  });

  it('never returns a fractional or unsafe number, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = parseMoney(text);
        if (result !== null) {
          expect(Number.isSafeInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(MAX_CENTS);
        }
      }),
    );
  });
});

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [50, '$0.50'],
    [100, '$1.00'],
    [123456, '$1,234.56'],
    [100000, '$1,000.00'],
    [99999999, '$999,999.99'],
    [MAX_CENTS, '$999,999,999.99'],
    [-500, '-$5.00'],
    [-123456, '-$1,234.56'],
  ])('shows %i as %s', (cents, expected) => {
    expect(formatMoney(toCents(cents))).toBe(expected);
  });
});

describe('moneyInputValue', () => {
  it('has no symbols or commas', () => {
    expect(moneyInputValue(toCents(123456))).toBe('1234.56');
    expect(moneyInputValue(toCents(5))).toBe('0.05');
    expect(moneyInputValue(toCents(-500))).toBe('-5.00');
  });
});

describe('toCents', () => {
  it.each([[0], [1], [-1], [MAX_CENTS], [-MAX_CENTS]])('accepts %d', (value) => {
    expect(toCents(value)).toBe(value);
  });

  it.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [MAX_CENTS + 1], [-MAX_CENTS - 1]])(
    'rejects %d',
    (value) => {
      expect(() => toCents(value)).toThrow(RangeError);
    },
  );
});

describe('sumCents', () => {
  it('adds exactly where decimal numbers would not', () => {
    // 0.1 + 0.2 is 0.30000000000000004 as decimal numbers.
    expect(sumCents([toCents(10), toCents(20)])).toBe(30);
  });

  it('is zero for nothing', () => {
    expect(sumCents([])).toBe(0);
  });

  it('refuses a total too large to trust', () => {
    expect(() => sumCents([toCents(MAX_CENTS), toCents(1)])).toThrow(RangeError);
  });

  it('does not depend on order', () => {
    const small = fc.integer({ min: 0, max: 1_000_000 }).map((value) => toCents(value));
    fc.assert(
      fc.property(fc.array(small, { maxLength: 50 }), (amounts: Cents[]) => {
        expect(sumCents([...amounts].reverse())).toBe(sumCents(amounts));
      }),
    );
  });
});
