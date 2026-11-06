import type { HealthResponse } from '@remidy/contracts';
import type { Database } from '@remidy/db';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerErrorHandling } from './errors.ts';
import { requestId } from './logging.ts';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_BODY_BYTES = 256 * 1024;

interface AppOptions {
  database: Pick<Database, 'ping'>;
  logger?: FastifyServerOptions['logger'];
}

export function buildApp({ database, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({
    logger,
    bodyLimit: MAX_BODY_BYTES,
    genReqId: (request) => requestId(request.headers[REQUEST_ID_HEADER]),
  });

  app.addHook('onRequest', (request, reply, done) => {
    // Awaiting a reply waits for the whole response, so this must not be awaited.
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  registerErrorHandling(app);

  // Checked every few seconds by Docker, so only problems are worth logging.
  app.get('/api/health', { logLevel: 'warn' }, async (_request, reply) => {
    const isUp = await database.ping();
    const body: HealthResponse = isUp
      ? { status: 'ok', database: 'up' }
      : { status: 'degraded', database: 'down' };
    return reply.code(isUp ? 200 : 503).send(body);
  });

  return app;
}
