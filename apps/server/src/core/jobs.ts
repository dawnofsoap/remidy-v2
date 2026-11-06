import { jobStatusResponse, type JobStatusResponse } from '@remidy/contracts';
import { jobStatus, type Orm } from '@remidy/db';
import { eq, sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import {
  defineFeature,
  defineRoute,
  type Feature,
  type FeatureDependencies,
  type Job,
} from './feature.ts';

const HEARTBEAT = 'heartbeat';
const RETRIES = 3;
const RETRY_DELAY_SECONDS = 30;
const LONGEST_RUN_SECONDS = 10 * 60;
const KEEP_FINISHED_SECONDS = 24 * 60 * 60;
const STOP_TIMEOUT_MS = 10_000;

export function defineJob(job: Job): Job {
  return job;
}

/** Proves that scheduled jobs are running. If this goes quiet, the status page says so. */
export const heartbeatJob = defineJob({
  name: HEARTBEAT,
  description: 'Shows that background jobs are running.',
  cron: '* * * * *',
  everyMinutes: 1,
  run: () => Promise.resolve(),
});

/** The jobs of every feature that's switched on. */
export function jobsOfFeatures(
  features: Feature[],
  enabledFeatures: string[],
  dependencies: FeatureDependencies,
): Job[] {
  return features
    .filter((feature) => !feature.flagged || enabledFeatures.includes(feature.name))
    .flatMap((feature) => feature.jobs?.(dependencies) ?? []);
}

interface JobRunnerOptions {
  connectionString: string;
  orm: Orm;
  jobs: Job[];
  log: { error: (details: object, message: string) => void };
  retryDelaySeconds?: number;
}

export interface JobRunner {
  start(): Promise<void>;
  /** Runs a job soon, without waiting for its schedule. */
  runNow(name: string): Promise<void>;
  /** Lets running jobs finish, up to a limit. */
  stop(): Promise<void>;
}

function recordStart(orm: Orm, name: string) {
  const startedAt = new Date();
  return orm
    .insert(jobStatus)
    .values({ name, lastStartedAt: startedAt })
    .onConflictDoUpdate({ target: jobStatus.name, set: { lastStartedAt: startedAt } });
}

function recordSuccess(orm: Orm, name: string) {
  return orm
    .update(jobStatus)
    .set({ lastSucceededAt: new Date(), consecutiveFailures: 0 })
    .where(eq(jobStatus.name, name));
}

function recordFailure(orm: Orm, name: string) {
  return orm
    .update(jobStatus)
    .set({
      lastFailedAt: new Date(),
      consecutiveFailures: sql`${jobStatus.consecutiveFailures} + 1`,
    })
    .where(eq(jobStatus.name, name));
}

/**
 * Runs jobs from a queue kept in Postgres, so they survive restarts, and any number of copies of
 * the app can run together without doing the same work twice.
 */
export function createJobRunner({
  connectionString,
  orm,
  jobs,
  log,
  retryDelaySeconds = RETRY_DELAY_SECONDS,
}: JobRunnerOptions): JobRunner {
  const boss = new PgBoss({ connectionString });
  boss.on('error', (error) => {
    log.error({ err: error }, 'The job runner had a problem');
  });

  async function attempt({ name, run }: Job, retryCount: number): Promise<void> {
    await recordStart(orm, name);
    try {
      await run();
    } catch (error) {
      // The detail goes to the logs only, because anything could be in an error's message, and
      // being an instance admin gives no access to anyone's bills.
      log.error({ err: error, job: name, attempt: retryCount + 1 }, 'A background job failed');
      await recordFailure(orm, name);
      throw error;
    }
    await recordSuccess(orm, name);
  }

  return {
    async start() {
      await boss.start();
      for (const job of jobs) {
        await boss.createQueue(job.name, {
          // Never more than one waiting, so jobs can't pile up while the app is down.
          policy: 'stately',
          retryLimit: RETRIES,
          retryDelay: retryDelaySeconds,
          retryBackoff: true,
          expireInSeconds: LONGEST_RUN_SECONDS,
          deleteAfterSeconds: KEEP_FINISHED_SECONDS,
        });
        await boss.schedule(job.name, job.cron);
        await boss.work(
          job.name,
          { batchSize: 1, pollingIntervalSeconds: 1, includeMetadata: true },
          async ([claimed]) => {
            await attempt(job, claimed?.retryCount ?? 0);
          },
        );
      }
    },

    async runNow(name) {
      await boss.send(name);
    },

    async stop() {
      await boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
    },
  };
}

type JobState = JobStatusResponse[number]['state'];

/** Twice the schedule, so that one slow or retried run doesn't raise an alarm. */
function isLate(job: Job, lastSucceededAt: Date, now: Date): boolean {
  return now.getTime() - lastSucceededAt.getTime() > job.everyMinutes * 2 * 60_000;
}

export async function readJobStatuses(
  orm: Orm,
  jobs: Job[],
  now = new Date(),
): Promise<JobStatusResponse> {
  const rows = await orm.select().from(jobStatus);
  return jobs.map((job) => {
    const row = rows.find((candidate) => candidate.name === job.name);
    let state: JobState = 'waiting';
    if (row?.consecutiveFailures) state = 'failing';
    else if (row?.lastSucceededAt) state = isLate(job, row.lastSucceededAt, now) ? 'late' : 'ok';
    return {
      name: job.name,
      description: job.description,
      state,
      lastSucceededAt: row?.lastSucceededAt?.toISOString() ?? null,
      lastFailedAt: row?.lastFailedAt?.toISOString() ?? null,
    };
  });
}

/** Lets instance admins see whether jobs are working. */
export function jobStatusFeature({ orm, jobs }: { orm: Orm; jobs: Job[] }): Feature {
  return defineFeature({
    name: 'job-status',
    routes: () => [
      defineRoute({
        method: 'GET',
        url: '/api/admin/jobs',
        access: 'instance-admin',
        response: jobStatusResponse satisfies z.ZodType<JobStatusResponse>,
        handler: () => readJobStatuses(orm, jobs),
      }),
    ],
  });
}
