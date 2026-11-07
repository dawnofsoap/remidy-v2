// Tables are added here as features need them, then `pnpm db:generate` creates the migration.
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// The next five tables hold what Better Auth, the sign-in library, expects. Its names are fixed.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** Manages the instance. Grants no access to anyone's bills. */
  isInstanceAdmin: boolean('is_instance_admin').notNull().default(false),
  /** Set while the password is a generated one, shown in a console. Nothing else works until it's replaced. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  ...timestamps,
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [uniqueIndex('account_provider_unique').on(table.providerId, table.accountId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

/**
 * Failed sign-ins by email and client address, including emails with no account, so results don't
 * reveal which exist. Counting per address means a stranger can't lock the real person out, which
 * matters because the admin's address is public knowledge.
 */
export const loginThrottle = pgTable(
  'login_throttle',
  {
    email: text('email').notNull(),
    address: text('address').notNull(),
    failedCount: integer('failed_count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.email, table.address] })],
);

/**
 * When each background job last ran. It has no error messages, which go to the logs, because
 * anything could be in one and instance admins have no access to anyone's bills.
 */
export const jobStatus = pgTable('job_status', {
  name: text('name').primaryKey(),
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  lastSucceededAt: timestamp('last_succeeded_at', { withTimezone: true }),
  lastFailedAt: timestamp('last_failed_at', { withTimezone: true }),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
});

export const spaceKind = pgEnum('space_kind', ['personal', 'shared']);
export const spaceRole = pgEnum('space_role', ['member', 'manager', 'owner']);

/** Everything a person tracks belongs to a space: their personal one, or a shared household. */
export const space = pgTable('space', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text('name').notNull(),
  kind: spaceKind('kind').notNull(),
  /** Decides what "today" means for this space's due dates. */
  timeZone: text('time_zone').notNull().default('UTC'),
  ...timestamps,
});

/** The only record of who belongs to a space, and of their role in it. */
export const membership = pgTable(
  'membership',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => space.id, { onDelete: 'cascade' }),
    role: spaceRole('role').notNull(),
    createdAt: timestamps.createdAt,
  },
  (table) => [primaryKey({ columns: [table.userId, table.spaceId] })],
);

/**
 * A space's bill categories. New spaces get a starter set from a database trigger, so it can't be
 * missed by any way a space is created.
 */
export const category = pgTable(
  'category',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Set when archived: hidden from choices for new bills, but kept for history. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  // One name per space, whatever its case.
  (table) => [
    uniqueIndex('category_space_id_name_unique').on(table.spaceId, sql`lower(${table.name})`),
  ],
);

/** How a bill repeats. Mirrors `Schedule` in @remidy/domain, which works out its due dates. */
export type BillSchedule =
  | { kind: 'once'; firstDue: string }
  | {
      kind: 'repeat';
      unit: 'week' | 'month' | 'year';
      every: number;
      firstDue: string;
      lastDue: string | null;
    };

/**
 * Something that's paid on a schedule. A personal bill is in its owner's personal space, and a
 * shared one in their household. Its category comes from the household's list when the owner has
 * one, which a database trigger checks.
 */
export const bill = pgTable(
  'bill',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Null only for a variable bill with no usual amount. */
    expectedCents: bigint('expected_cents', { mode: 'number' }),
    isVariable: boolean('is_variable').notNull().default(false),
    schedule: jsonb('schedule').$type<BillSchedule>().notNull(),
    categoryId: uuid('category_id').references(() => category.id, { onDelete: 'restrict' }),
    autopay: boolean('autopay').notNull().default(false),
    url: text('url'),
    notes: text('notes'),
    /** Set when archived: no new due dates, but the past is kept. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('bill_space_id_idx').on(table.spaceId)],
);

/**
 * Each time a bill is due. Name, category and amount are copied from the bill when the occurrence
 * is created, so editing the bill later doesn't rewrite what was due.
 */
export const billOccurrence = pgTable(
  'bill_occurrence',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    // Deleting a bill removes its occurrences. Payments will refuse that once a bill has any.
    billId: uuid('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    /** The bill's space, kept here so every query can be scoped without a join. */
    spaceId: uuid('space_id')
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    billName: text('bill_name').notNull(),
    categoryId: uuid('category_id').references(() => category.id, { onDelete: 'restrict' }),
    expectedCents: bigint('expected_cents', { mode: 'number' }),
    isVariable: boolean('is_variable').notNull(),
    state: text('state', { enum: ['open', 'settled', 'skipped'] })
      .notNull()
      .default('open'),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    // Makes generating due dates safe to repeat.
    uniqueIndex('bill_occurrence_bill_id_due_on_unique').on(table.billId, table.dueOn),
    index('bill_occurrence_space_id_due_on_idx').on(table.spaceId, table.dueOn),
  ],
);

/**
 * Every change to something with history, written in the same transaction as the change. The
 * database refuses to update or delete a row here, so what happened can't be rewritten later.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    /** Not a foreign key, so the record survives its author's account. Null means Remidy itself. */
    actorId: text('actor_id'),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Ids are in time order, so this also lists a space's history newest first.
  (table) => [index('activity_log_space_id_id_idx').on(table.spaceId, table.id)],
);
