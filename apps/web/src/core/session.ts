import { apiErrorResponse, sessionResponse, signInOptionsResponse } from '@remidy/contracts';
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

export const fetchSignInOptions = ({ signal }: { signal: AbortSignal }) =>
  get('/api/sign-in-options', signInOptionsResponse, signal);

export const fetchSession = ({ signal }: { signal: AbortSignal }) =>
  get('/api/auth/get-session', sessionResponse, signal);

export const SESSION_QUERY_KEY = ['session'];
export const SIGN_IN_OPTIONS_QUERY_KEY = ['sign-in-options'];

export async function signIn(email: string, password: string): Promise<void> {
  try {
    await post('/api/auth/sign-in/email', { email, password });
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

export function signOut() {
  return post('/api/auth/sign-out', {});
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  try {
    await post('/api/auth/change-password', {
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
  const sessions = await get('/api/auth/list-sessions', sessionsResponse, signal);
  return Math.max(0, sessions.length - 1);
};

export function revokeOtherSessions() {
  return post('/api/auth/revoke-other-sessions', {});
}
