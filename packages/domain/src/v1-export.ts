import {
  addDays,
  dateFromParts,
  datePartsOf,
  parseCalendarDate,
  type CalendarDate,
} from './dates.ts';
import { parseMoney, type Cents } from './money.ts';
import type { RepeatUnit, Schedule } from './schedule.ts';

/**
 * Reading the data export v1 offers, so its bills can be brought into v2 and reviewed before
 * anything is saved. v1's payment history isn't read: v2 starts its history fresh.
 */

/** A bill as it will be offered for import. Nothing here is saved until the person reviews it. */
export interface ImportedBill {
  name: string;
  /** Null for a bill that varies with no usual amount. */
  cents: Cents | null;
  isVariable: boolean;
  schedule: Schedule;
  categoryName: string | null;
  accountName: string | null;
  autopay: boolean;
  shared: boolean;
  /** Stopped in v1, so it comes in archived. */
  archived: boolean;
  url: string | null;
  notes: string | null;
}

export interface ImportedAccount {
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'other';
  institution: string | null;
  lastFour: string | null;
  shared: boolean;
  archived: boolean;
}

export interface V1Import {
  bills: ImportedBill[];
  accounts: ImportedAccount[];
  categoryNames: string[];
  /** Bills that couldn't be read, with why, so nothing goes missing quietly. */
  skipped: { name: string; reason: string }[];
}

/** Thrown when the file isn't a v1 export at all. Its message is written to show the person. */
export class NotAV1Export extends Error {
  override name = 'NotAV1Export';
}

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);

/**
 * v1 sent dates through JavaScript's Date, so a due date can arrive as a timestamp shifted by the
 * server's time zone: midnight in Chicago is 06:00 the same day, but midnight in Tokyo is 15:00 the
 * day before. A time after noon means the date was pushed back, so the next day is meant.
 */
export function readV1Date(value: unknown): CalendarDate | null {
  const raw = text(value);
  if (!raw) return null;
  const date = parseCalendarDate(raw.slice(0, 10));
  if (!date) return null;
  const time = /T(\d{2}):/.exec(raw);
  return time && Number(time[1]) >= 12 ? addDays(date, 1) : date;
}

/** v1's frequency names, and its custom "6-weekly" form, as a v2 repeat. */
export function readV1Frequency(
  value: unknown,
): { kind: 'once' } | { kind: 'repeat'; unit: RepeatUnit; every: number } | null {
  const frequency = text(value)?.toLowerCase() ?? 'monthly';
  const named: Record<string, { unit: RepeatUnit; every: number } | 'once'> = {
    'one-time': 'once',
    weekly: { unit: 'week', every: 1 },
    biweekly: { unit: 'week', every: 2 },
    monthly: { unit: 'month', every: 1 },
    quarterly: { unit: 'month', every: 3 },
    annually: { unit: 'year', every: 1 },
    yearly: { unit: 'year', every: 1 },
  };
  const known = named[frequency];
  if (known === 'once') return { kind: 'once' };
  if (known) return { kind: 'repeat', ...known };
  const custom = /^(\d{1,2})-(weekly|monthly|yearly)$/.exec(frequency);
  if (!custom) return null;
  const every = Number(custom[1]);
  if (every < 1) return null;
  const unit = ({ weekly: 'week', monthly: 'month', yearly: 'year' } as const)[
    custom[2] as 'weekly' | 'monthly' | 'yearly'
  ];
  return { kind: 'repeat', unit, every };
}

/** The first due date: v1's start date, or its older due day in the month the export was made. */
function firstDueOf(row: Row, exportedOn: CalendarDate): CalendarDate | null {
  const start = readV1Date(row.start_date);
  if (start) return start;
  const day = typeof row.due_day === 'number' ? row.due_day : Number(text(row.due_day));
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const { year, month } = datePartsOf(exportedOn);
  for (let candidate = day; candidate >= 28; candidate -= 1) {
    const date = dateFromParts(year, month, candidate);
    if (date) return date;
  }
  return dateFromParts(year, month, day);
}

function readBill(row: Row, exportedOn: CalendarDate): ImportedBill | { problem: string } {
  const frequency = readV1Frequency(row.billing_frequency);
  if (!frequency) {
    return {
      problem: `Its frequency, “${String(row.billing_frequency)}”, isn’t one v2 can repeat.`,
    };
  }
  const firstDue = firstDueOf(row, exportedOn);
  if (!firstDue) return { problem: 'It has no start date or due day.' };

  const isVariable = row.is_variable_amount === true;
  const amountText = typeof row.amount === 'number' ? String(row.amount) : text(row.amount);
  const cents = amountText === null ? null : parseMoney(amountText);
  if (amountText !== null && cents === null)
    return { problem: `Its amount, “${amountText}”, isn’t a number.` };
  if (!isVariable && (cents === null || cents === 0)) {
    return { problem: 'It has no amount, and isn’t marked as varying.' };
  }

  const lastDue = readV1Date(row.end_date);
  const schedule: Schedule =
    frequency.kind === 'once'
      ? { kind: 'once', firstDue }
      : { kind: 'repeat', unit: frequency.unit, every: frequency.every, firstDue, lastDue };
  return {
    name: text(row.bill_name) ?? 'Unnamed bill',
    cents: isVariable && cents === 0 ? null : cents,
    isVariable,
    schedule,
    categoryName: text(row.category),
    accountName: text(row.payment_account_name),
    autopay: row.auto_pay === true,
    shared: row.ownership === 'household',
    archived: row.is_active === false,
    url: text(row.url),
    notes: text(row.notes),
  };
}

const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'other'] as const;

function readAccount(row: Row): ImportedAccount | null {
  const name = text(row.account_name);
  if (!name) return null;
  const type = ACCOUNT_TYPES.find((candidate) => candidate === row.account_type) ?? 'other';
  const lastFour = text(row.last_four);
  return {
    name,
    type,
    institution: text(row.institution_name),
    // Only ever the last four digits, whatever was stored.
    lastFour: lastFour && /^\d{4}$/.test(lastFour) ? lastFour : null,
    shared: row.ownership === 'household',
    archived: row.is_active === false,
  };
}

/** Reads a v1 export file's contents. Refuses anything that isn't one. */
export function readV1Export(json: unknown): V1Import {
  if (!isRow(json) || !Array.isArray(json.bills) || typeof json.exportVersion !== 'string') {
    throw new NotAV1Export('That file isn’t a v1 export. In v1, export your data from Settings.');
  }
  const exportedOn = readV1Date(json.exportDate) ?? ('2026-01-01' as CalendarDate);

  const bills: ImportedBill[] = [];
  const skipped: V1Import['skipped'] = [];
  for (const row of rows(json.bills)) {
    const result = readBill(row, exportedOn);
    if ('problem' in result)
      skipped.push({ name: text(row.bill_name) ?? 'Unnamed bill', reason: result.problem });
    else bills.push(result);
  }

  const categoryNames = [
    ...new Set(
      [
        ...rows(json.categories).map((row) => text(row.name)),
        ...bills.map((bill) => bill.categoryName),
      ].filter((name): name is string => name !== null),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    bills,
    accounts: rows(json.paymentAccounts).flatMap((row) => readAccount(row) ?? []),
    categoryNames,
    skipped,
  };
}
