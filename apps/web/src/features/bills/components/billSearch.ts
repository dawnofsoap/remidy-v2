import type { Bill } from '../api.ts';

/** Lower case with accents taken off, so "Café" and "cafe" match each other. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Whether a bill matches what's been typed: every word must appear somewhere in its name,
 * merchant or category. Nothing typed matches every bill.
 */
export function matchesSearch(
  bill: Pick<Bill, 'name' | 'merchant' | 'categoryName'>,
  query: string,
): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const text = plain([bill.name, bill.merchant, bill.categoryName].filter(Boolean).join(' '));
  return words.every((word) => text.includes(word));
}
