import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema.ts';

export { schema };
export * from './schema.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

// An arbitrary number, shared by every copy of the app, that identifies "running migrations".
const MIGRATION_LOCK = 7_302_114;

export type Orm = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Orm['transaction']>[0]>[0];

export interface Database {
  /** Typed queries. Only `repo.ts` files and server core may use this. */
  orm: Orm;
  /** Resolves to true when the database answers a query. */
  ping(): Promise<boolean>;
  /**
   * Applies any pending migrations, all or none. Safe to run from several copies of the app at
   * once, because each waits its turn. The folder can be overridden for tests.
   */
  migrate(folder?: string): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  // An idle client losing its connection must not crash the process; ping reports the outage.
  pool.on('error', () => undefined);

  return {
    orm: drizzle(pool, { schema }),
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async migrate(folder = MIGRATIONS_FOLDER) {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
        await migrate(drizzle(client), { migrationsFolder: folder });
      } finally {
        // Releasing the connection without the unlock would hold the lock until the pool closes.
        await client
          .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
          .catch(() => undefined);
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
