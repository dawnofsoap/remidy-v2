import {
  ADMIN_EMAIL,
  ADMIN_USERNAME,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  unmetPasswordRequirements,
} from '@remidy/contracts';
import { schema, user, type Orm } from '@remidy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors.ts';
import type { Authorize, Authorized, Route } from '../feature.ts';
import { createPersonalSpace, findMembership, roleAtLeast } from '../spaces.ts';
import { clearFailedSignIns, isLockedOut, normalizeEmail, recordFailedSignIn } from './throttle.ts';

/** A header only this server sets, replacing anything a client sends, so limits can't be dodged. */
const CLIENT_IP_HEADER = 'x-remidy-client-ip';

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
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // The admin account is created on first start. Others will come from invitations.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    databaseHooks: {
      user: {
        create: {
          // Everyone has a personal space from the moment their account exists.
          after: async (created) => {
            await createPersonalSpace(orm, created.id);
          },
        },
      },
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

function callBetterAuth(
  auth: Auth,
  publicUrl: string,
  request: FastifyRequest,
  body: unknown = request.body,
): Promise<Response> {
  return auth.handler(
    new Request(new URL(request.url, publicUrl), {
      method: request.method,
      headers: toFetchHeaders(request),
      ...(request.method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
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

function stringField(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown> | null | undefined)?.[field];
  return typeof value === 'string' ? value : null;
}

/** The admin signs in with a username. Everyone else uses an email address. */
function emailForSignIn(typed: string): string {
  return normalizeEmail(typed) === ADMIN_USERNAME ? ADMIN_EMAIL : typed;
}

function refuseNewPassword(message: string): AppError {
  return new AppError(422, 'validation_failed', 'Check the highlighted fields and try again.', [
    { path: 'body.newPassword', message },
  ]);
}

function checkNewPassword(body: unknown): void {
  const newPassword = stringField(body, 'newPassword');
  if (newPassword === null) return;
  const unmet = unmetPasswordRequirements(newPassword);
  if (unmet.length > 0) {
    const needed = unmet.map((requirement) => requirement.label.toLowerCase()).join(', ');
    throw refuseNewPassword(`This password needs: ${needed}.`);
  }
  if (newPassword === stringField(body, 'currentPassword')) {
    throw refuseNewPassword('Choose a password different from your current one.');
  }
}

/** Makes the allowed sign-in endpoints reachable, with account lockout around sign-in. */
export function registerAuthRoutes(
  app: FastifyInstance,
  {
    auth,
    orm,
    publicUrl,
    requestsPerMinute,
  }: { auth: Auth; orm: Orm; publicUrl: string; requestsPerMinute: number },
): void {
  const route: Route = {
    method: 'POST',
    url: '/api/auth/*',
    access: 'public',
    run: () => Promise.reject(new Error('Handled directly')),
  };
  app.declaredRoutes.push(route);

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?', 1)[0]?.replace('/api/auth', '') ?? '';
    const allowed = Object.hasOwn(ALLOWED_ENDPOINTS, path) ? ALLOWED_ENDPOINTS[path] : undefined;
    if (!allowed?.includes(request.method as 'GET' | 'POST')) {
      throw new AppError(404, 'not_found', 'That wasn’t found.');
    }

    if (path === '/change-password') {
      checkNewPassword(request.body);
      const current = await auth.api.getSession({ headers: toFetchHeaders(request) });
      const response = await callBetterAuth(auth, publicUrl, request);
      if (response.status === 200 && current) {
        await orm
          .update(user)
          .set({ mustChangePassword: false })
          .where(eq(user.id, current.user.id));
      }
      return sendResponse(response, reply);
    }

    const typed = path === '/sign-in/email' ? stringField(request.body, 'email') : null;
    if (typed === null) return sendResponse(await callBetterAuth(auth, publicUrl, request), reply);

    const email = emailForSignIn(typed);
    if (await isLockedOut(orm, email, request.ip)) throw LOCKED_OUT;
    const body = { ...(request.body as object), email };
    const response = await callBetterAuth(auth, publicUrl, request, body);
    // Count the attempt before answering, so the next attempt always sees it.
    if (response.status === 200) await clearFailedSignIns(orm, email, request.ip);
    else if (response.status === 401) await recordFailedSignIn(orm, email, request.ip);
    return sendResponse(response, reply);
  };

  // Sign-in has its own limit, tighter than the general one and counted separately, so that
  // busy use of the rest of the app can't crowd it out. It's checked before the database is used.
  const rateLimit = { max: requestsPerMinute, timeWindow: '1 minute' };
  app.get('/api/auth/*', { config: { declaredRoute: true, rateLimit } }, handler);
  app.post('/api/auth/*', { config: { declaredRoute: true, rateLimit } }, handler);
}

/** Decides who may call a route, using the session cookie and the caller's memberships. */
export function createAuthorize(auth: Auth, orm: Orm): Authorize {
  return async (access, request): Promise<Authorized> => {
    const session = await auth.api.getSession({ headers: toFetchHeaders(request) });
    if (!session) throw new AppError(401, 'not_signed_in', 'Sign in to continue.');
    if (session.user.mustChangePassword === true) {
      throw new AppError(403, 'password_change_required', 'Choose a new password to continue.');
    }
    const user = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isInstanceAdmin: session.user.isInstanceAdmin === true,
    };

    if (access === 'signed-in') return { user, space: null };
    if (access === 'instance-admin') {
      if (!user.isInstanceAdmin)
        throw new AppError(403, 'forbidden', 'You don’t have access to that.');
      return { user, space: null };
    }

    const { spaceId } = request.params as { spaceId?: unknown };
    const role =
      typeof spaceId === 'string' ? await findMembership(orm, user.userId, spaceId) : null;
    // Not a member gets the same answer as no such space, so this reveals nothing about others.
    if (!role || typeof spaceId !== 'string') {
      throw new AppError(404, 'not_found', 'That wasn’t found.');
    }
    if (!roleAtLeast(role, access.space)) {
      throw new AppError(403, 'forbidden', 'Your role in this space doesn’t allow that.');
    }
    return { user, space: { id: spaceId, role } };
  };
}
