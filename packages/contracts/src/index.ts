import { z } from 'zod';

export * from './password.ts';

export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponse>;

export const signInOptionsResponse = z.object({
  /** True while the admin's generated password, printed in the server console, is still in use. */
  adminPasswordInConsole: z.boolean(),
});

/** The signed-in person, or null when nobody is. */
export const sessionResponse = z
  .object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      /** Set while the password is a generated one, which must be replaced before anything else. */
      mustChangePassword: z.boolean(),
    }),
  })
  .nullable();

export const enabledFeaturesResponse = z.object({
  /** Flagged features that are switched on. */
  enabled: z.array(z.string()),
});

/** The shape of every error the API returns. */
export const apiErrorResponse = z.object({
  error: z.object({
    /** Stable and safe to check in code, for example `not_found`. */
    code: z.string(),
    /** Safe to show to a person. */
    message: z.string(),
    /** Quote this when reporting a problem. It matches the server logs. */
    requestId: z.string(),
    /** Problems with individual fields, when there are any. */
    fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponse>;
