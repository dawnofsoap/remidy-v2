import { healthResponse, type HealthResponse } from '@remidy/contracts';
import { useQuery } from '@tanstack/react-query';

async function fetchHealth({ signal }: { signal: AbortSignal }): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  return healthResponse.parse(await response.json());
}

/** Warns when the server or database is down. Stays out of the way otherwise. */
export function ServerStatus() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: false,
  });

  if (!isError && data?.status !== 'degraded') {
    return null;
  }
  return (
    <p role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 font-semibold text-danger">
      {isError
        ? 'Remidy can’t reach the server. Changes may not save until it’s back.'
        : 'The database is unavailable. Changes may not save until it’s back.'}
    </p>
  );
}
