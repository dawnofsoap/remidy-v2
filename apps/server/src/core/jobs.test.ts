import { jobStatus } from '@remidy/db';
import { startTestDatabase, type TestDatabase } from '@remidy/db/testing';
import { PgBoss } from 'pg-boss';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { unavailableEncryptor } from './encryption.ts';
import type { Job } from './feature.ts';
import { defineFeature } from './feature.ts';
import {
  createJobRunner,
  defineJob,
  heartbeatJob,
  jobsOfFeatures,
  readJobStatuses,
  type JobRunner,
} from './jobs.ts';

let test: TestDatabase;
let log: { error: Mock<(details: object, message: string) => void> };
let running: JobRunner[] = [];
let nextName = 0;

const newName = () => `test-job-${String((nextName += 1))}`;

const job = (run: () => Promise<void>, overrides: Partial<Job> = {}): Job =>
  defineJob({
    name: newName(),
    description: 'A job for tests.',
    // Far enough away that only runNow starts these.
    cron: '0 0 1 1 *',
    everyMinutes: 60,
    run,
    ...overrides,
  });

async function start(jobs: Job[]): Promise<JobRunner> {
  const runner = createJobRunner({
    connectionString: test.url,
    orm: test.database.orm,
    jobs,
    log,
    retryDelaySeconds: 1,
  });
  await runner.start();
  running.push(runner);
  return runner;
}

const statusOf = async (target: Job, now?: Date) => {
  const [status] = await readJobStatuses(test.database.orm, [target], now);
  if (!status) throw new Error('No status.');
  return status;
};

beforeAll(async () => {
  test = await startTestDatabase();
  await test.database.migrate();
}, 180_000);

afterAll(async () => {
  await test.stop();
});

beforeEach(() => {
  log = { error: vi.fn<(details: object, message: string) => void>() };
});

afterEach(async () => {
  await Promise.all(running.map((runner) => runner.stop()));
  running = [];
});

describe('running a job', () => {
  it('runs it, and shows that it worked', async () => {
    const run = vi.fn(() => Promise.resolve());
    const target = job(run);
    const runner = await start([target]);
    expect((await statusOf(target)).state).toBe('waiting');

    await runner.runNow(target.name);
    await expect.poll(() => run.mock.calls.length, { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => (await statusOf(target)).state, { timeout: 5000 }).toBe('ok');
    expect((await statusOf(target)).lastSucceededAt).not.toBeNull();
    expect((await statusOf(target)).lastFailedAt).toBeNull();
  });

  it('retries a failure, and recovers without leaving an alarm', async () => {
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('A brief problem'))
      .mockResolvedValue(undefined);
    const target = job(run);
    const runner = await start([target]);

    await runner.runNow(target.name);
    await expect.poll(() => run.mock.calls.length, { timeout: 30_000 }).toBe(2);
    await expect.poll(async () => (await statusOf(target)).state, { timeout: 5000 }).toBe('ok');
    expect((await statusOf(target)).lastFailedAt).not.toBeNull();
  });

  it('gives up after the retries, and the failure stays visible', async () => {
    const run = vi.fn(() => Promise.reject(new Error('Always broken')));
    const target = job(run);
    const runner = await start([target]);

    await runner.runNow(target.name);
    await expect.poll(() => run.mock.calls.length, { timeout: 45_000 }).toBe(4);
    await expect
      .poll(async () => (await statusOf(target)).state, { timeout: 5000 })
      .toBe('failing');
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
    expect(run).toHaveBeenCalledTimes(4);
  }, 60_000);

  it('logs the detail, and keeps it out of the status', async () => {
    const secret = 'Key (memo)=(rent for Alex) already exists';
    const target = job(() => Promise.reject(new Error(secret)));
    const runner = await start([target]);

    await runner.runNow(target.name);
    await expect.poll(() => log.error.mock.calls.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(log.error.mock.calls[0]?.[0]).toMatchObject({
      job: target.name,
      attempt: 1,
      err: expect.objectContaining({ message: secret }) as unknown,
    });
    await expect
      .poll(async () => (await statusOf(target)).state, { timeout: 5000 })
      .toBe('failing');
    expect(JSON.stringify(await statusOf(target))).not.toContain('rent');
    const rows = await test.database.orm.select().from(jobStatus);
    expect(JSON.stringify(rows)).not.toContain('rent');
  });
});

describe('restarts and several copies', () => {
  it('runs a job that was waiting while nothing was running', async () => {
    const run = vi.fn(() => Promise.resolve());
    const target = job(run);
    const earlier = new PgBoss({ connectionString: test.url });
    earlier.on('error', () => undefined);
    await earlier.start();
    await earlier.createQueue(target.name, { policy: 'stately' });
    await earlier.send(target.name);
    await earlier.stop({ graceful: false });
    expect(run).not.toHaveBeenCalled();

    await start([target]);
    await expect.poll(() => run.mock.calls.length, { timeout: 20_000 }).toBe(1);
  });

  it('can start again with the same jobs', async () => {
    const run = vi.fn(() => Promise.resolve());
    const target = job(run);
    const first = await start([target]);
    await first.stop();
    running = [];
    const second = await start([target]);
    await second.runNow(target.name);
    await expect.poll(() => run.mock.calls.length, { timeout: 20_000 }).toBe(1);
  });

  it('runs a job once, with two copies of the app running', async () => {
    const run = vi.fn(() => Promise.resolve());
    const target = job(run);
    const first = await start([target]);
    await start([target]);

    await first.runNow(target.name);
    await expect.poll(() => run.mock.calls.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lets a running job finish when stopping', async () => {
    let finished = false;
    let begun = false;
    const target = job(async () => {
      begun = true;
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
      finished = true;
    });
    const runner = await start([target]);
    await runner.runNow(target.name);
    await expect.poll(() => begun, { timeout: 20_000 }).toBe(true);

    await runner.stop();
    running = [];
    expect(finished).toBe(true);
  });
});

describe('schedules', () => {
  it('starts a job on its schedule, with no other prompting', async () => {
    const run = vi.fn(() => Promise.resolve());
    await start([job(run, { cron: '* * * * *', everyMinutes: 1 })]);
    await expect.poll(() => run.mock.calls.length, { timeout: 150_000 }).toBeGreaterThan(0);
  }, 160_000);

  it('keeps the heartbeat going every minute', () => {
    expect(heartbeatJob).toMatchObject({ name: 'heartbeat', cron: '* * * * *', everyMinutes: 1 });
  });
});

describe('job status', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
  const orm = () => test.database.orm;
  const report = (target: Job, now: Date) => statusOf(target, now);

  it('calls a job late when it has missed its schedule by more than double', async () => {
    const target = job(() => Promise.resolve(), { everyMinutes: 10 });
    await orm()
      .insert(jobStatus)
      .values({ name: target.name, lastSucceededAt: at(0) });
    expect((await report(target, at(20))).state).toBe('ok');
    expect((await report(target, at(21))).state).toBe('late');
  });

  it('calls a job failing until it succeeds again, even if it is also late', async () => {
    const target = job(() => Promise.resolve());
    await orm()
      .insert(jobStatus)
      .values({ name: target.name, lastSucceededAt: at(0), consecutiveFailures: 1 });
    expect((await report(target, at(59))).state).toBe('failing');
  });

  it('lists jobs that have never run, and only the jobs asked about', async () => {
    const target = job(() => Promise.resolve());
    const statuses = await readJobStatuses(orm(), [target]);
    expect(statuses.map((status) => status.name)).toEqual([target.name]);
    expect(statuses[0]).toMatchObject({
      state: 'waiting',
      lastSucceededAt: null,
      lastFailedAt: null,
    });
  });
});

describe('jobs from features', () => {
  const ofFeature = (name: string, flagged: boolean) =>
    defineFeature({
      name,
      flagged,
      routes: () => [],
      jobs: () => [job(() => Promise.resolve(), { name })],
    });

  it('includes features that are on, and leaves out flagged ones that are off', () => {
    const features = [
      ofFeature('always', false),
      ofFeature('switched-on', true),
      ofFeature('switched-off', true),
      defineFeature({ name: 'no-jobs', routes: () => [] }),
    ];
    const jobs = jobsOfFeatures(features, ['switched-on'], {
      database: test.database,
      encryptor: unavailableEncryptor,
    });
    expect(jobs.map((item) => item.name)).toEqual(['always', 'switched-on']);
  });
});
