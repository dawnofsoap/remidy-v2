import {
  apiErrorResponse,
  jobStatusResponse,
  sessionResponse,
  signInOptionsResponse,
  spaceResponse,
} from '@remidy/contracts';
import { z } from 'zod';

/** A failed request, with a message that's safe to show and any problems with individual fields. */
export class RequestFailure extends Error {
  override name = 'RequestFailure';
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const GENERIC_FAILURE = 'That didn’t work. Check your connection and try again.';

async function failureFrom(response: Response, fallback: string): Promise<RequestFailure> {
  const parsed = apiErrorResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return new RequestFailure(response.status, fallback);
  const fields = Object.fromEntries(
    (parsed.data.error.fields ?? []).map((field) => [
      field.path.replace(/^body\./, ''),
      field.message,
    ]),
  );
  return new RequestFailure(response.status, parsed.data.error.message, fields);
}

async function post(url: string, body: object, fallback = GENERIC_FAILURE): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failureFrom(response, fallback);
}

async function get<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) throw await failureFrom(response, GENERIC_FAILURE);
  return schema.parse(await response.json());
}

/**
 * Calls the API for a feature. A failure becomes a RequestFailure with a message that's safe to
 * show, and field problems keyed by field name. Without a schema, the response body is ignored.
 */
export async function apiRequest<T = undefined>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  options: { body?: object; schema?: z.ZodType<T>; signal?: AbortSignal } = {},
): Promise<T> {
  const { body, schema, signal } = options;
  const response = await fetch(url, {
    method,
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw await failureFrom(response, GENERIC_FAILURE);
  return (schema ? schema.parse(await response.json()) : undefined) as T;
}

export const fetchSignInOptions = ({ signal }: { signal: AbortSignal }) =>
  get('/api/v1/sign-in-options', signInOptionsResponse, signal);

export const fetchSession = ({ signal }: { signal: AbortSignal }) =>
  get('/api/v1/auth/get-session', sessionResponse, signal);

const spacesResponse = z.array(spaceResponse);

export const fetchSpaces = ({ signal }: { signal: AbortSignal }) =>
  get('/api/v1/spaces', spacesResponse, signal);

export async function updateSpace(id: string, changes: { timeZone: string }): Promise<void> {
  const response = await fetch(`/api/v1/spaces/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw await failureFrom(response, GENERIC_FAILURE);
}

export const fetchJobStatuses = ({ signal }: { signal: AbortSignal }) =>
  get('/api/v1/admin/jobs', jobStatusResponse, signal);

export const SESSION_QUERY_KEY = ['session'];
export const SIGN_IN_OPTIONS_QUERY_KEY = ['sign-in-options'];

export async function signIn(email: string, password: string): Promise<void> {
  try {
    await post('/api/v1/auth/sign-in/email', { email, password });
  } catch (error) {
    if (error instanceof RequestFailure && (error.status === 401 || error.status === 400)) {
      // The same message either way, so this doesn't reveal which accounts exist.
      throw new RequestFailure(error.status, 'That email or password isn’t right.');
    }
    if (error instanceof RequestFailure && error.status === 429) {
      throw new RequestFailure(429, 'Too many attempts. Wait 15 minutes and try again.');
    }
    throw error;
  }
}

/** The answer is the same whether or not the address has an account, so there's nothing to report. */
export function requestPasswordReset(email: string) {
  return post('/api/v1/auth/request-password-reset', { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  try {
    await post('/api/v1/auth/reset-password', { token, newPassword });
  } catch (error) {
    if (error instanceof RequestFailure && error.status === 400) {
      throw new RequestFailure(400, 'This link has expired or was already used.');
    }
    throw error;
  }
}

export function signOut() {
  return post('/api/v1/auth/sign-out', {});
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  try {
    await post('/api/v1/auth/change-password', {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
  } catch (error) {
    if (error instanceof RequestFailure && error.status === 400) {
      throw new RequestFailure(400, 'Your current password isn’t right.');
    }
    throw error;
  }
}

const sessionsResponse = z.array(z.object({ id: z.string() }));

export const fetchOtherSessionCount = async ({ signal }: { signal: AbortSignal }) => {
  const sessions = await get('/api/v1/auth/list-sessions', sessionsResponse, signal);
  return Math.max(0, sessions.length - 1);
};

export function revokeOtherSessions() {
  return post('/api/v1/auth/revoke-other-sessions', {});
}

/**
 * Gives a new account's personal space the browser's time zone, in place of the default. Settings
 * can always change it, so a failure here isn't worth interrupting anyone over.
 */
export async function adoptBrowserTimeZone(): Promise<void> {
  try {
    const spaces = await get('/api/v1/spaces', spacesResponse);
    const personal = spaces.find((space) => space.kind === 'personal');
    if (personal?.timeZone === 'UTC') {
      const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
      await updateSpace(personal.id, { timeZone });
    }
  } catch {
    // Left as it is.
  }
}
