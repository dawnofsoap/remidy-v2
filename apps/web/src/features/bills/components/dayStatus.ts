import type { AgendaEntry } from '@remidy/contracts';
import { addDays, type CalendarDate } from '@remidy/domain';
import { CircleAlert, CircleCheck, CircleMinus, Clock, type LucideIcon } from 'lucide-react';

/** How soon "due soon" is. */
export const SOON_DAYS = 7;

export type DayStatus = 'overdue' | 'soon' | 'upcoming' | 'paid' | 'skipped';

/** Each status in words and an icon as well as color, since color alone isn't enough. */
export const DAY_STATUS: Record<
  DayStatus,
  { label: string; icon: LucideIcon | null; text: string; chip: string; dot: string }
> = {
  overdue: {
    label: 'Overdue',
    icon: CircleAlert,
    text: 'text-danger',
    chip: 'bg-danger-soft text-danger',
    dot: 'bg-danger',
  },
  soon: {
    label: 'Due soon',
    icon: Clock,
    text: 'text-warn',
    chip: 'bg-warn-soft text-warn',
    dot: 'bg-warn',
  },
  upcoming: {
    label: 'Upcoming',
    icon: null,
    text: '',
    chip: 'bg-surface-2 text-ink',
    dot: 'bg-upcoming',
  },
  paid: {
    label: 'Paid',
    icon: CircleCheck,
    text: 'text-paid',
    chip: 'text-paid',
    dot: 'bg-paid',
  },
  skipped: {
    label: 'Skipped',
    icon: CircleMinus,
    text: 'text-ink-2',
    chip: 'text-ink-2 line-through',
    dot: 'bg-upcoming',
  },
};

type StatusEntry = Pick<AgendaEntry, 'dueOn' | 'state'>;

export function dayStatusOf(entry: StatusEntry, today: CalendarDate): DayStatus {
  if (entry.state === 'settled') return 'paid';
  if (entry.state === 'skipped') return 'skipped';
  if (entry.dueOn < today) return 'overdue';
  if (entry.dueOn <= addDays(today, SOON_DAYS)) return 'soon';
  return 'upcoming';
}

const URGENCY: DayStatus[] = ['overdue', 'soon', 'upcoming', 'paid', 'skipped'];

/** The status that matters most on a day with several bills, or null for a day with none. */
export function mostUrgent(entries: StatusEntry[], today: CalendarDate): DayStatus | null {
  const statuses = new Set(entries.map((entry) => dayStatusOf(entry, today)));
  return URGENCY.find((status) => statuses.has(status)) ?? null;
}

/** A day's bills in the order they matter: what needs paying first, then what's done. */
export function byUrgency<T extends StatusEntry & { name: string }>(
  entries: T[],
  today: CalendarDate,
): T[] {
  const rank = (entry: T) => URGENCY.indexOf(dayStatusOf(entry, today));
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
