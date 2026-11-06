import type { HealthResponse } from '@remidy/contracts';
import type { Database } from '@remidy/db';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

interface AppOptions {
  database: Pick<Database, 'ping'>;
  logger?: FastifyServerOptions['logger'];
}

export function buildApp({ database, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/api/health', async (_request, reply) => {
    const isUp = await database.ping();
    const body: HealthResponse = isUp
      ? { status: 'ok', database: 'up' }
      : { status: 'degraded', database: 'down' };
    return reply.code(isUp ? 200 : 503).send(body);
  });

  return app;
}
