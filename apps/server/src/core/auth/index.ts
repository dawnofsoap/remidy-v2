import { schema, type Orm } from '@remidy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors.ts';
import type { Authorize, Principal, Route } from '../feature.ts';
import { clearFailedSignIns, isLockedOut, recordFailedSignIn } from './throttle.ts';

/** A header only this server sets, replacing anything a client sends, so limits can't be dodged. */
const CLIENT_IP_HEADER = 'x-remidy-client-ip';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * The only Better Auth endpoints reachable from outside. Anything else, such as public sign-up
 * or account deletion, doesn't exist as far as a client can tell.
 */
const ALLOWED_ENDPOINTS: Record<string, readonly ('GET' | 'POST')[]> = {
  '/sign-in/email': ['POST'],
  '/sign-out': ['POST'],
  '/get-session': ['GET'],
  '/change-password': ['POST'],
  '/list-sessions': ['GET'],
  '/revoke-session': ['POST'],
  '/revoke-other-sessions': ['POST'],
};

interface AuthOptions {
  orm: Orm;
  secret: string;
  publicUrl: string;
}

export function createAuth({ orm, secret, publicUrl }: AuthOptions) {
  return betterAuth({
    appName: 'Remidy',
    baseURL: publicUrl,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [publicUrl],
    telemetry: { enabled: false },
    database: drizzleAdapter(orm, { provider: 'pg', schema }),
    user: {
      additionalFields: {
        // Never settable through the API.
        isInstanceAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Accounts come from first-run setup, and later from invitations.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // No cookie cache: a revoked session must stop working immediately.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      // Better Auth only enables this in production by default.
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 20 },
        '/change-password': { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: publicUrl.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

function toFetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (value) headers.set(name, value.join(', '));
  }
  headers.set(CLIENT_IP_HEADER, request.ip);
  return headers;
}

function callBetterAuth(auth: Auth, publicUrl: string, request: FastifyRequest): Promise<Response> {
  return auth.handler(
    new Request(new URL(request.url, publicUrl), {
      method: request.method,
      headers: toFetchHeaders(request),
      ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
    }),
  );
}

async function sendResponse(response: Response, reply: FastifyReply): Promise<FastifyReply> {
  void reply.code(response.status);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') void reply.header(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) void reply.header('set-cookie', cookies);
  return reply.send(await response.text());
}

const LOCKED_OUT = new AppError(
  429,
  'too_many_attempts',
  'Too many failed sign-in attempts. Wait 15 minutes and try again.',
);

function emailFrom(body: unknown): string | null {
  const email = (body as { email?: unknown } | null | undefined)?.email;
  return typeof email === 'string' ? email : null;
}

/** Makes the allowed sign-in endpoints reachable, with account lockout around sign-in. */
export function registerAuthRoutes(
  app: FastifyInstance,
  { auth, orm, publicUrl }: { auth: Auth; orm: Orm; publicUrl: string },
): void {
  const route: Route = {
    method: 'POST',
    url: '/api/auth/*',
    access: 'public',
    run: () => Promise.reject(new Error('Handled directly')),
  };
  app.declaredRoutes.push(route);

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { declaredRoute: true },
    handler: async (request, reply) => {
      const path = request.url.split('?', 1)[0]?.replace('/api/auth', '') ?? '';
      const allowed = Object.hasOwn(ALLOWED_ENDPOINTS, path) ? ALLOWED_ENDPOINTS[path] : undefined;
      if (!allowed?.includes(request.method as 'GET' | 'POST')) {
        throw new AppError(404, 'not_found', 'That wasn’t found.');
      }

      const email = path === '/sign-in/email' ? emailFrom(request.body) : null;
      if (email === null)
        return sendResponse(await callBetterAuth(auth, publicUrl, request), reply);

      if (await isLockedOut(orm, email)) throw LOCKED_OUT;
      const response = await callBetterAuth(auth, publicUrl, request);
      // Count the attempt before answering, so the next attempt always sees it.
      if (response.status === 200) await clearFailedSignIns(orm, email);
      else if (response.status === 401) await recordFailedSignIn(orm, email);
      return sendResponse(response, reply);
    },
  });
}

/** Decides who may call a route, using the session cookie. */
export function createAuthorize(auth: Auth): Authorize {
  return async (_access, request): Promise<Principal> => {
    const session = await auth.api.getSession({ headers: toFetchHeaders(request) });
    if (!session) throw new AppError(401, 'not_signed_in', 'Sign in to continue.');
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isInstanceAdmin: session.user.isInstanceAdmin === true,
    };
  };
}
