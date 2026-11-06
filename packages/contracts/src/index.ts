import { z } from 'zod';

export const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponse>;

export const setupStatusResponse = z.object({
  /** True until the first account has been created. */
  needed: z.boolean(),
});

export function createSetupRequest(minPassword: number, maxPassword: number) {
  return z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(100, 'Use 100 characters or fewer.'),
    email: z.email('Enter a valid email address.').max(254, 'Use 254 characters or fewer.'),
    password: z
      .string()
      .min(minPassword, `Use at least ${String(minPassword)} characters.`)
      .max(maxPassword, `Use ${String(maxPassword)} characters or fewer.`),
  });
}

/** The signed-in person, or null when nobody is. */
export const sessionResponse = z
  .object({
    user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
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
