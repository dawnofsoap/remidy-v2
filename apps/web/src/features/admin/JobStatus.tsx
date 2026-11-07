import type { JobStatusResponse } from '@remidy/contracts';
import { formatInstant } from '@remidy/domain';
import { useQuery } from '@tanstack/react-query';
import { fetchJobStatuses } from '../../core/session.ts';
import { ErrorState, List, ListRow, LoadingState } from '../../ui/index.ts';

type Job = JobStatusResponse[number];

const STATE_LABELS: Record<Job['state'], string> = {
  ok: 'Working',
  waiting: 'Hasn’t run yet',
  late: 'Late',
  failing: 'Failing',
};

function whenItLastRan(job: Job): string {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const worked = job.lastSucceededAt
    ? `Last worked ${formatInstant(job.lastSucceededAt, timeZone)}.`
    : 'Hasn’t worked yet.';
  if (job.state !== 'failing' || !job.lastFailedAt) return worked;
  return `Last failed ${formatInstant(job.lastFailedAt, timeZone)}. The server logs have the details. ${worked}`;
}

/** For instance admins, to see that scheduled work is really happening. */
export function JobStatus() {
  const jobs = useQuery({
    queryKey: ['job-status'],
    queryFn: fetchJobStatuses,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">Scheduled work the server runs, such as reminders.</p>
      {jobs.isPending ? <LoadingState label="Loading background jobs" /> : null}
      {jobs.isError ? (
        <ErrorState
          message="Background job status couldn’t be loaded."
          onRetry={() => void jobs.refetch()}
        />
      ) : null}
      {jobs.data ? (
        <List label="Background jobs">
          {jobs.data.map((job) => (
            <ListRow
              key={job.name}
              title={job.description}
              subtitle={whenItLastRan(job)}
              end={
                <span
                  className={
                    job.state === 'failing' || job.state === 'late'
                      ? 'font-semibold text-danger'
                      : ''
                  }
                >
                  {STATE_LABELS[job.state]}
                </span>
              }
            />
          ))}
        </List>
      ) : null}
    </div>
  );
}
