import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabase, type Database } from './index.ts';

export const POSTGRES_IMAGE = 'postgres:18-alpine';

export interface TestDatabase {
  database: Database;
  url: string;
  stop(): Promise<void>;
}

/** Starts a real, empty Postgres in Docker. Slow, so share one per test file. */
export async function startTestDatabase(image = POSTGRES_IMAGE): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(image).start();
  const url = container.getConnectionUri();
  const database = createDatabase(url);
  return {
    database,
    url,
    stop: async () => {
      await database.close();
      await container.stop();
    },
  };
}
