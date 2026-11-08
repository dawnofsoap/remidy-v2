import type { CalendarDate } from '@remidy/domain';
import { describe, expect, it } from 'vitest';
import { byUrgency, dayStatusOf, mostUrgent } from './dayStatus.ts';

const today = '2026-11-08' as CalendarDate;
const due = (dueOn: string, state: 'open' | 'settled' | 'skipped' = 'open', name = 'Bill') => ({
  dueOn,
  state,
  name,
});

describe('a due date’s status on the calendar', () => {
  it.each([
    [due('2026-11-07'), 'overdue'],
    [due('2026-11-08'), 'soon'],
    [due('2026-11-15'), 'soon'],
    [due('2026-11-16'), 'upcoming'],
    [due('2026-11-01', 'settled'), 'paid'],
    [due('2026-11-01', 'skipped'), 'skipped'],
    [due('2026-11-20', 'settled'), 'paid'],
  ] as const)('%j is %s', (entry, status) => {
    expect(dayStatusOf(entry, today)).toBe(status);
  });
});

describe('a day with several bills', () => {
  it('shows the status that matters most', () => {
    expect(mostUrgent([due('2026-11-07', 'settled'), due('2026-11-07')], today)).toBe('overdue');
    expect(mostUrgent([due('2026-11-30', 'skipped'), due('2026-11-30')], today)).toBe('upcoming');
    expect(mostUrgent([due('2026-11-01', 'skipped'), due('2026-11-01', 'settled')], today)).toBe(
      'paid',
    );
    expect(mostUrgent([], today)).toBeNull();
  });

  it('lists what needs paying first, then by name', () => {
    const sorted = byUrgency(
      [
        due('2026-11-07', 'settled', 'Alpha'),
        due('2026-11-07', 'open', 'Zeta'),
        due('2026-11-07', 'open', 'Beta'),
        due('2026-11-07', 'skipped', 'Aardvark'),
      ],
      today,
    );
    expect(sorted.map((entry) => entry.name)).toEqual(['Beta', 'Zeta', 'Alpha', 'Aardvark']);
  });
});
