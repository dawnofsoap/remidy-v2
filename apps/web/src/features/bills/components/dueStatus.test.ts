import type { CalendarDate } from '@remidy/domain';
import { describe, expect, it } from 'vitest';
import { dueSummary, type DueEntry } from './dueStatus.ts';

const today = '2026-11-08' as CalendarDate;
const due = (overrides: Partial<DueEntry>): DueEntry => ({
  id: 'o1',
  spaceId: 'sp1',
  name: 'Water',
  dueOn: '2026-11-10',
  expectedCents: 70_000,
  isVariable: false,
  state: 'open',
  paidCents: 0,
  ...overrides,
});

describe('a due date summed up in one line', () => {
  it.each([
    ['Due soon · $700.00', due({})],
    ['Overdue · $500.00 left', due({ dueOn: '2026-11-07', paidCents: 20_000 })],
    ['Upcoming · Varies', due({ dueOn: '2026-12-01', isVariable: true, expectedCents: null })],
    // The words already say how it stands, so they aren't said twice.
    ['Paid $700.00', due({ state: 'settled', paidCents: 70_000 })],
    ['Skipped', due({ state: 'skipped' })],
  ])('reads %s', (text, entry) => {
    expect(dueSummary(entry, today)).toBe(text);
  });
});
