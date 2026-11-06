import { healthResponse, type HealthResponse } from '@remidy/contracts';
import { useEffect, useState } from 'react';

async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  return healthResponse.parse(await response.json());
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | 'loading' | 'unreachable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch(() => {
        if (!controller.signal.aborted) setHealth('unreachable');
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <h1>Remidy</h1>
      <p>{describe(health)}</p>
    </main>
  );
}

function describe(health: HealthResponse | 'loading' | 'unreachable'): string {
  if (health === 'loading') return 'Checking the server…';
  if (health === 'unreachable') return 'The server can’t be reached.';
  return health.status === 'ok' ? 'Server and database are running.' : 'The database is down.';
}
