import type { BillScheduleInput } from '@remidy/contracts';
import type { CalendarDate, RepeatUnit } from '@remidy/domain';

/** The choices in the form. Custom covers any "every N" the common ones don't. */
export const REPEATS = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
  { value: 'custom', label: 'Custom…' },
] as const;
export type Repeat = (typeof REPEATS)[number]['value'];

const PRESETS: Record<Exclude<Repeat, 'once' | 'custom'>, { unit: RepeatUnit; every: number }> = {
  weekly: { unit: 'week', every: 1 },
  biweekly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'year', every: 1 },
};

export interface RepeatChoice {
  repeat: Repeat;
  /** Only used for Custom. */
  every: number;
  unit: RepeatUnit;
}

/** Which choice shows a saved schedule. One that matches no common choice is Custom. */
export function choiceOf(schedule: BillScheduleInput): RepeatChoice {
  if (schedule.kind === 'once') return { repeat: 'once', every: 1, unit: 'month' };
  const match = Object.entries(PRESETS).find(
    ([, preset]) => preset.unit === schedule.unit && preset.every === schedule.every,
  );
  return {
    repeat: (match?.[0] as Repeat | undefined) ?? 'custom',
    every: schedule.every,
    unit: schedule.unit,
  };
}

export function scheduleOf(
  choice: RepeatChoice,
  firstDue: CalendarDate,
  lastDue: CalendarDate | null,
): BillScheduleInput {
  if (choice.repeat === 'once') return { kind: 'once', firstDue };
  const { unit, every } = choice.repeat === 'custom' ? choice : PRESETS[choice.repeat];
  return { kind: 'repeat', unit, every, firstDue, lastDue };
}
