import type { ApiErrorResponse } from '@remidy/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type Fields = NonNullable<ApiErrorResponse['error']['fields']>;

/** An expected failure. Its message is shown to the person, so keep it helpful and free of secrets. */
export class AppError extends Error {
  override name = 'AppError';
  readonly statusCode: number;
  readonly code: string;
  readonly fields: Fields | undefined;

  constructor(statusCode: number, code: string, message: string, fields?: Fields) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
  }
}

// Fastify's own messages can repeat request contents, so they're replaced with these.
const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'bad_request', message: 'The request couldn’t be understood.' },
  404: { code: 'not_found', message: 'That wasn’t found.' },
  405: { code: 'method_not_allowed', message: 'That action isn’t allowed here.' },
  413: { code: 'payload_too_large', message: 'That request is too large.' },
  415: { code: 'unsupported_media_type', message: 'That content type isn’t supported.' },
  429: { code: 'too_many_requests', message: 'Too many requests. Wait a moment and try again.' },
};
const INTERNAL = { code: 'internal_error', message: 'Something went wrong on the server.' };

function send(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  body: { code: string; message: string; fields?: Fields },
) {
  const response: ApiErrorResponse = { error: { ...body, requestId: request.id } };
  return reply.code(statusCode).send(response);
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return send(request, reply, error.statusCode, {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      });
    }
    const known = error.statusCode ? CLIENT_ERRORS[error.statusCode] : undefined;
    if (known && error.statusCode) {
      return send(request, reply, error.statusCode, known);
    }
    // Unexpected, so log the detail and tell the person nothing about the internals.
    request.log.error({ err: error }, 'Unhandled error');
    return send(request, reply, 500, INTERNAL);
  });

  app.setNotFoundHandler((request, reply) =>
    send(request, reply, 404, CLIENT_ERRORS[404] ?? INTERNAL),
  );
}

/** The Postgres error code behind a failed query, which Drizzle may wrap in one or more errors. */
function databaseErrorCode(error: unknown): string | undefined {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const { code } = current as { code?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/** The database refused to delete something because other rows still point at it. */
export const isStillUsed = (error: unknown) =>
  ['23001', '23503'].includes(databaseErrorCode(error) ?? '');
