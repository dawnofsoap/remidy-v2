import pg from 'pg';

export interface Database {
  /** Resolves to true when the database answers a query. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  // An idle client losing its connection must not crash the process; ping reports the outage.
  pool.on('error', () => undefined);

  return {
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
