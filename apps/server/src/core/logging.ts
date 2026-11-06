import { randomUUID } from 'node:crypto';
import type { FastifyServerOptions } from 'fastify';
import type { Config } from './config.ts';

// A caller-supplied ID helps trace a request, but only if it can't corrupt the logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function requestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && SAFE_REQUEST_ID.test(header) ? header : randomUUID();
}

/** Query strings can carry tokens, so logs record only the path. */
function withoutQuery(url: string): string {
  return url.split('?', 1)[0] ?? '';
}

export function loggerOptions(
  level: Config['LOG_LEVEL'],
): NonNullable<FastifyServerOptions['logger']> {
  return {
    level,
    // Only the fields below are logged from a request, and these stay redacted if ever added.
    redact: {
      paths: [
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.authorization',
        '*.cookie',
        'req.headers',
      ],
      censor: '[redacted]',
    },
    serializers: {
      req: (request: { method: string; url: string }) => ({
        method: request.method,
        path: withoutQuery(request.url),
      }),
    },
  };
}
