import { sql } from 'drizzle-orm';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './index.ts';
import { startTestDatabase, type TestDatabase } from './testing.ts';

const STARTUP_TIMEOUT = 180_000;

/** Writes a throwaway migrations folder in the format Drizzle reads. */
function migrationsFolder(statements: string[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'remidy-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const entries = statements.map((statement, idx) => {
    const tag = `000${String(idx)}_test`;
    writeFileSync(join(folder, `${tag}.sql`), statement);
    return { idx, version: '7', when: 1_000 + idx, tag, breakpoints: true };
  });
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
  );
  return folder;
}

describe('database', () => {
  let test: TestDatabase;
  const folders: string[] = [];
  const folder = (statements: string[]) => {
    const created = migrationsFolder(statements);
    folders.push(created);
    return created;
  };
  const tableExists = async (name: string) => {
    const result = await test.database.orm.execute(
      sql`select to_regclass(${`public.${name}`}) as found`,
    );
    return result.rows[0]?.found !== null;
  };

  beforeAll(async () => {
    test = await startTestDatabase();
  }, STARTUP_TIMEOUT);

  afterAll(async () => {
    await test.stop();
    folders.forEach((created) => {
      rmSync(created, { recursive: true, force: true });
    });
  });

  it('answers a ping', async () => {
    await expect(test.database.ping()).resolves.toBe(true);
  });

  it('reports false, without throwing, when the database is unreachable', async () => {
    const unreachable = createDatabase('postgresql://nobody:x@127.0.0.1:1/none');
    await expect(unreachable.ping()).resolves.toBe(false);
    await unreachable.close();
  });

  describe('the real migrations', () => {
    it('apply to an empty database', async () => {
      await test.database.migrate();
      const applied = await test.database.orm.execute(
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      );
      const journal = JSON.parse(
        readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'),
      ) as { entries: unknown[] };
      expect(journal.entries.length).toBeGreaterThan(0);
      expect(applied.rows[0]?.count).toBe(journal.entries.length);
    });

    it('do nothing the second time', async () => {
      await expect(test.database.migrate()).resolves.toBeUndefined();
    });

    it('leave the time-ordered ID function available', async () => {
      const result = await test.database.orm.execute(sql`select uuidv7() as id`);
      expect(result.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('migrating', () => {
    it('lets several copies of the app start at once', async () => {
      const shared = folder(['CREATE TABLE concurrent_test (id integer);']);
      await forgetAppliedMigrations();
      const copies = Array.from({ length: 5 }, () => createDatabase(test.url));
      await Promise.all(copies.map((copy) => copy.migrate(shared)));
      await Promise.all(copies.map((copy) => copy.close()));
      await expect(tableExists('concurrent_test')).resolves.toBe(true);
    });

    it('applies all pending migrations or none', async () => {
      const failing = folder([
        'CREATE TABLE partial_test (id integer);',
        'CREATE TABLE partial_test_broken (id not_a_real_type);',
      ]);
      await expect(createIsolated(failing)).rejects.toThrow();
      await expect(tableExists('partial_test')).resolves.toBe(false);
    });

    it('releases its lock after a failure', async () => {
      const failing = folder(['SELECT not_a_real_column;']);
      await expect(createIsolated(failing)).rejects.toThrow();

      const fine = folder(['CREATE TABLE after_failure_test (id integer);']);
      await createIsolated(fine);
      await expect(tableExists('after_failure_test')).resolves.toBe(true);
    });

    // Drizzle skips anything dated before the latest applied migration, and these fixtures are old.
    async function forgetAppliedMigrations() {
      await test.database.orm.execute(sql`delete from drizzle.__drizzle_migrations`);
    }

    async function createIsolated(path: string) {
      await forgetAppliedMigrations();
      const copy = createDatabase(test.url);
      try {
        await copy.migrate(path);
      } finally {
        await copy.close();
      }
    }
  });
});

describe('an older Postgres', () => {
  it(
    'is refused with a clear message',
    async () => {
      const old = await startTestDatabase('postgres:17-alpine');
      try {
        await expect(old.database.migrate()).rejects.toThrow();
        const cause = await old.database.migrate().catch((error: unknown) => {
          const { cause: inner } = error as { cause?: { message?: string } };
          return inner?.message ?? String(error);
        });
        expect(cause).toContain('PostgreSQL 18');
      } finally {
        await old.stop();
      }
    },
    STARTUP_TIMEOUT,
  );
});
