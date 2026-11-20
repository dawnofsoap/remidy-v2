import { describe, expect, it } from 'vitest';
import { matchesSearch } from './billSearch.ts';

const bill = (
  name: string,
  merchant: string | null = null,
  categoryName: string | null = null,
) => ({
  name,
  merchant,
  categoryName,
});

describe('finding a bill by what you type', () => {
  it('matches everything when nothing is typed', () => {
    expect(matchesSearch(bill('Water'), '')).toBe(true);
    expect(matchesSearch(bill('Water'), '   ')).toBe(true);
  });

  it('matches part of the name, whatever the case', () => {
    expect(matchesSearch(bill('Electric'), 'elec')).toBe(true);
    expect(matchesSearch(bill('Electric'), 'TRIC')).toBe(true);
    expect(matchesSearch(bill('Electric'), 'water')).toBe(false);
  });

  it('matches the merchant and the category too', () => {
    expect(matchesSearch(bill('Credit card', 'Chase'), 'chase')).toBe(true);
    expect(matchesSearch(bill('Gym', null, 'Health'), 'health')).toBe(true);
  });

  it('needs every word, from any of them', () => {
    const card = bill('Credit card', 'Chase', 'Cards');
    expect(matchesSearch(card, 'chase credit')).toBe(true);
    expect(matchesSearch(card, 'chase discover')).toBe(false);
  });

  it('ignores accents, so a plain letter finds an accented one', () => {
    expect(matchesSearch(bill('Café rent'), 'cafe')).toBe(true);
    expect(matchesSearch(bill('Cafe rent'), 'café')).toBe(true);
  });
});
